#!/usr/bin/env bash
# Sauvegarde de la base de Kiraku, chaque nuit sur le VPS (installation, copie hors du serveur et restauration :
# deploy/README.md, « Sauvegarde de la base »).
#
#   bash deploy/backup.sh           une sauvegarde : dump, chiffrement, vérification, rotation, copie hors du serveur
#   bash deploy/backup.sh --check   vérifie seulement la configuration (aucun dump, rien d'envoyé)
#
# Une passe :
#   1. lit l'URL de la base dans le fichier d'env de l'app en ligne (DIRECT_URL, sinon DATABASE_URL), sans l'afficher ;
#   2. pg_dump au format custom (compressé), dans le conteneur Postgres s'il tourne et publie le port de l'URL (même
#      version que le serveur), sinon avec le pg_dump de la machine. Le flux est chiffré à la volée (gpg, AES-256,
#      phrase de passe) : aucune copie en clair n'est écrite sur le disque ;
#   3. vérifie l'archive : déchiffrement complet, table des matières lisible, tables User et _prisma_migrations
#      présentes. Une archive en échec est effacée, les précédentes restent ;
#   4. rotation : les KEEP_DAILY dernières quotidiennes, et la première de chaque semaine pendant KEEP_WEEKLY semaines ;
#   5. copie hors du serveur avec rclone si KIRAKU_BACKUP_REMOTE est réglé. Sans elle, une perte du VPS emporte aussi
#      les sauvegardes : le journal le rappelle à chaque passe ;
#   6. signal à un service de surveillance si KIRAKU_BACKUP_PING_URL est réglé (l'adresse en cas de succès,
#      l'adresse suivie de « /fail » en cas d'échec).
#
# Réglages facultatifs dans ~/.config/kiraku/backup.conf (chmod 600), en lignes shell CLÉ="valeur" :
#   KIRAKU_BACKUP_DIR           dossier des sauvegardes et du journal (défaut ~/kiraku-backups)
#   KIRAKU_ENV_FILE             fichier d'env à lire (défaut : .env.production puis .env de la release en ligne,
#                               ~/kiraku-releases/current, sinon de ~/kiraku)
#   KIRAKU_DB_CONTAINER         conteneur Postgres (défaut kiraku-db)
#   KIRAKU_BACKUP_KEEP_DAILY    quotidiennes gardées (défaut 7)
#   KIRAKU_BACKUP_KEEP_WEEKLY   hebdomadaires gardées (défaut 4)
#   KIRAKU_BACKUP_MIN_FREE_MB   place laissée libre sur le disque en plus de deux fois la dernière archive (défaut
#                               1024 : la base est sur le même disque, un disque plein l'arrêterait)
#   KIRAKU_BACKUP_REMOTE        destination rclone déjà configurée (`rclone config`), ex. « ovh:kiraku-backups »
#   KIRAKU_BACKUP_REMOTE_PRUNE  1 (défaut) : même rotation sur la destination ; 0 : rien n'y est effacé
#   KIRAKU_BACKUP_PING_URL      adresse de surveillance (healthchecks.io ou équivalent), jamais affichée
# Phrase de passe : ~/.config/kiraku/backup-passphrase (chmod 600, 20 caractères au moins), gardée AUSSI hors du VPS
# (gestionnaire de mots de passe) : sans elle, aucune sauvegarde n'est lisible.
#
# Journal : ~/kiraku-backups/backup.log (et l'écran quand le script est lancé à la main). Ni l'URL de la base, ni la
# phrase de passe, ni l'adresse de surveillance n'y sont écrites. Codes de sortie :
#   0 sauvegarde faite (et copiée si une destination est réglée) · 1 configuration à corriger · 2 dump, chiffrement
#   ou vérification en échec (rien de gardé pour cette passe) · 3 sauvegarde locale faite, copie hors du serveur en
#   échec · 4 une autre sauvegarde est déjà en cours
set -Eeuo pipefail
umask 077
export LC_ALL=C
# cron ne donne que /usr/bin:/bin ; rclone peut être dans /usr/local/bin ou /snap/bin
export PATH="$PATH:/usr/local/bin:/snap/bin"

CHECK=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    -h | --help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)" >&2; exit 1 ;;
  esac
done

CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/kiraku"
if [ -r "$CONF_DIR/backup.conf" ]; then
  # shellcheck source=/dev/null
  . "$CONF_DIR/backup.conf"
fi
SRC="${KIRAKU_SRC:-$HOME/kiraku}"
RELEASES="${KIRAKU_RELEASES:-$HOME/kiraku-releases}"
DIR="${KIRAKU_BACKUP_DIR:-$HOME/kiraku-backups}"
CONTAINER="${KIRAKU_DB_CONTAINER:-kiraku-db}"
KEEP_DAILY="${KIRAKU_BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${KIRAKU_BACKUP_KEEP_WEEKLY:-4}"
MIN_FREE_MB="${KIRAKU_BACKUP_MIN_FREE_MB:-1024}"
REMOTE="${KIRAKU_BACKUP_REMOTE:-}"
REMOTE_PRUNE="${KIRAKU_BACKUP_REMOTE_PRUNE:-1}"
PING_URL="${KIRAKU_BACKUP_PING_URL:-}"
PASSFILE="${KIRAKU_BACKUP_PASSPHRASE_FILE:-$CONF_DIR/backup-passphrase}"

mkdir -p "$DIR/daily" "$DIR/weekly"
if [ "$CHECK" = 0 ]; then
  # Lancé à la main : journal et écran ; par cron : journal seulement
  if [ -t 1 ]; then exec > >(tee -a "$DIR/backup.log") 2>&1; else exec >>"$DIR/backup.log" 2>&1; fi
fi

START=$(date +%s)
MAIN_PID=$BASHPID
CODE=1 # code d'un échec imprévu : 1 pendant la lecture de la configuration, 2 une fois le dump lancé
PARTIAL=""
log() { printf '%s %s\n' "$(date -u '+%Y-%m-%d %H:%M:%SZ')" "$*"; }
monitor() {
  [ -n "$PING_URL" ] || return 0
  local url=$PING_URL
  if [ "${1:-}" = fail ]; then url="${PING_URL%/}/fail"; fi
  curl -fsS -m 10 --retry 3 -o /dev/null "$url" 2>/dev/null || log "Avertissement : le service de surveillance ne répond pas."
}
fail() {
  local code=$1
  shift
  trap - ERR
  # Échec dans un sous-shell (substitution) : sa sortie peut être lue comme une donnée, et le shell principal
  # voit son code ; lui seul écrit au journal et prévient la surveillance
  if [ "$BASHPID" != "$MAIN_PID" ]; then exit "$code"; fi
  if [ -n "$PARTIAL" ]; then rm -f -- "$PARTIAL"; fi
  log "ÉCHEC (code $code) : $*"
  if [ "$CHECK" = 0 ]; then monitor fail; fi
  exit "$code"
}
trap 'fail "$CODE" "commande en échec à la ligne $LINENO (voir les lignes au-dessus)"' ERR

for tool in gpg flock sha256sum df stat; do
  command -v "$tool" >/dev/null || fail 1 "outil introuvable : $tool"
done
for value in "$KEEP_DAILY" "$KEEP_WEEKLY" "$MIN_FREE_MB"; do
  [[ $value =~ ^[0-9]+$ ]] || fail 1 "réglage non numérique : $value"
done
if [ "$KEEP_DAILY" -lt 1 ] || [ "$KEEP_WEEKLY" -lt 1 ]; then fail 1 "KIRAKU_BACKUP_KEEP_DAILY et KEEP_WEEKLY : 1 au moins"; fi

if [ "$CHECK" = 0 ]; then
  exec 9>"$DIR/.lock"
  if ! flock -n 9; then
    log "Une autre sauvegarde est en cours : rien de fait."
    exit 4
  fi
  # Restes d'une passe interrompue (machine redémarrée, processus tué) : sous le verrou, aucune autre ne les écrit
  rm -f -- "$DIR"/daily/.kiraku-*.partial
fi

# --- Phrase de passe : présente, à soi seul, assez longue ---
[ -f "$PASSFILE" ] || fail 1 "phrase de passe absente : $PASSFILE (voir deploy/README.md)"
if [ "$(stat -c '%u' "$PASSFILE")" != "$(id -u)" ] || [ $((8#$(stat -c '%a' "$PASSFILE") & 8#077)) -ne 0 ]; then
  fail 1 "$PASSFILE doit appartenir à $(id -un) et n'être lisible que par lui (chmod 600)"
fi
[ "$(head -n 1 "$PASSFILE" | tr -d '\r\n' | wc -c)" -ge 20 ] || fail 1 "phrase de passe trop courte (20 caractères au moins)"

# --- Configuration de la base : la même que l'app, lue sans être affichée ---

# Fichiers lus par l'app en ligne, du plus prioritaire au moins prioritaire (Next recopie .env et .env.production
# dans chaque release)
env_files() {
  if [ -n "${KIRAKU_ENV_FILE:-}" ]; then
    printf '%s\n' "$KIRAKU_ENV_FILE"
    return
  fi
  local base=$SRC current
  current=$(readlink -f "$RELEASES/current" 2>/dev/null || true)
  if [ -n "$current" ] && [ -f "$current/.env" ]; then base=$current; fi
  printf '%s\n' "$base/.env.production" "$base/.env"
}

# Valeur d'une clé dans un fichier dotenv (dernière définition, guillemets et commentaire retirés)
dotenv_value() {
  local file=$1 key=$2 line value
  [ -r "$file" ] || return 1
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file" | tail -n 1 || true)
  line=${line%$'\r'}
  [ -n "$line" ] || return 1
  value=${line#*=}
  value=${value#"${value%%[![:space:]]*}"}
  case $value in
    \"*) value=${value#\"}; value=${value%%\"*} ;;
    \'*) value=${value#\'}; value=${value%%\'*} ;;
    *) value=${value%%[[:space:]]#*}; value=${value%"${value##*[![:space:]]}"} ;;
  esac
  [ -n "$value" ] || return 1
  printf '%s' "$value"
}

# « %40 » → « @ » ; l'échappement passe par une variable (bash 5.2 retire les barres obliques du remplacement)
urldecode() {
  local escape='\x'
  printf '%b' "${1//%/$escape}"
}

mapfile -t ENV_FILES < <(env_files)
DB_URL="" DB_SOURCE=""
for key in DIRECT_URL DATABASE_URL; do
  for file in "${ENV_FILES[@]}"; do
    if DB_URL=$(dotenv_value "$file" "$key"); then
      DB_SOURCE="$key de $file"
      break 2
    fi
  done
done
[ -n "$DB_URL" ] || fail 1 "ni DIRECT_URL ni DATABASE_URL dans ${ENV_FILES[*]} (régler KIRAKU_ENV_FILE dans $CONF_DIR/backup.conf)"
case $DB_URL in
  postgres://* | postgresql://*) ;;
  *) fail 1 "$DB_SOURCE : URL PostgreSQL illisible" ;;
esac

# postgresql://utilisateur:mot-de-passe@hôte:port/base?paramètres
rest=${DB_URL#*://}
rest=${rest%%\?*}
authority=${rest%%/*}
DB_NAME=""
if [ "$authority" != "$rest" ]; then DB_NAME=$(urldecode "${rest#*/}"); fi
userinfo=""
hostport=$authority
if [[ $authority == *@* ]]; then
  userinfo=${authority%@*}
  hostport=${authority##*@}
fi
DB_USER=$(urldecode "${userinfo%%:*}")
DB_PASS=""
if [[ $userinfo == *:* ]]; then DB_PASS=$(urldecode "${userinfo#*:}"); fi
if [[ $hostport == \[* ]]; then
  DB_HOST=${hostport#\[}
  DB_HOST=${DB_HOST%%\]*}
  DB_PORT=${hostport##*\]}
  DB_PORT=${DB_PORT#:}
else
  DB_HOST=${hostport%%:*}
  DB_PORT=""
  if [[ $hostport == *:* ]]; then DB_PORT=${hostport#*:}; fi
fi
DB_PORT=${DB_PORT:-5432}
unset DB_URL rest authority userinfo
if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_HOST" ]; then fail 1 "$DB_SOURCE : base, utilisateur ou hôte manquant"; fi
[[ $DB_PORT =~ ^[0-9]+$ ]] || fail 1 "$DB_SOURCE : port illisible"
if [ -n "$DB_PASS" ]; then export PGPASSWORD=$DB_PASS; fi
unset DB_PASS

# --- Outil de dump : le conteneur de la base s'il sert bien l'adresse de l'URL, sinon pg_dump de la machine ---
MODE=""
running=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)
if [ "$running" = true ]; then
  case $DB_HOST in
    127.0.0.1 | localhost | ::1)
      if docker port "$CONTAINER" 5432/tcp 2>/dev/null | grep -Eq ":${DB_PORT}\$"; then MODE=container; fi
      ;;
  esac
fi
if [ -z "$MODE" ] && command -v pg_dump >/dev/null && command -v pg_restore >/dev/null; then MODE=host; fi
if [ -z "$MODE" ]; then
  fail 1 "aucun outil de dump : le conteneur $CONTAINER (arrêté, introuvable ou docker inaccessible à $(id -un)) ne publie pas le port $DB_PORT de l'URL, et pg_dump n'est pas installé"
fi
if [ "$MODE" = container ]; then WHERE="conteneur $CONTAINER"; else WHERE="pg_dump de la machine"; fi

dump() {
  # PGPASSWORD passe par son nom : sa valeur n'apparaît pas dans la ligne de commande
  if [ "$MODE" = container ]; then
    docker exec ${PGPASSWORD:+-e PGPASSWORD} "$CONTAINER" nice -n 10 \
      pg_dump --username="$DB_USER" --dbname="$DB_NAME" --format=custom
  else
    nice -n 10 pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" --format=custom
  fi
}
toc() {
  if [ "$MODE" = container ]; then docker exec -i "$CONTAINER" pg_restore --list; else pg_restore --list; fi
}
gpg_opts=(--batch --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-file "$PASSFILE")
decrypt() { gpg "${gpg_opts[@]}" --decrypt "$1"; }

# Archives d'un dossier, de la plus ancienne à la plus récente (le nom porte la date)
archives() {
  local files=("$1"/kiraku-*.dump.gpg)
  if [ -e "${files[0]}" ]; then printf '%s\n' "${files[@]}"; fi
}
prune_local() {
  local dir=$1 keep=$2 old
  while read -r old; do
    rm -f -- "$old" "$old.sha256"
  done < <(archives "$dir" | head -n -"$keep")
}

AVAIL_KB=$(df -Pk "$DIR" | awk 'NR == 2 { print $4 }')
LAST=$(archives "$DIR/daily" | tail -n 1)
LAST_KB=0
if [ -n "$LAST" ]; then LAST_KB=$(($(stat -c %s "$LAST") / 1024)); fi
NEED_KB=$((LAST_KB * 2 + MIN_FREE_MB * 1024))

if [ "$CHECK" = 1 ]; then
  echo "Base        : $DB_NAME sur $DB_HOST:$DB_PORT, utilisateur $DB_USER ($DB_SOURCE)"
  echo "Dump        : $WHERE"
  echo "Archives    : $DIR ($(archives "$DIR/daily" | wc -l) quotidiennes, $(archives "$DIR/weekly" | wc -l) hebdomadaires)"
  echo "Disque      : $((AVAIL_KB / 1024)) Mo libres, $((NEED_KB / 1024)) Mo demandés"
  if [ "$AVAIL_KB" -lt "$NEED_KB" ]; then echo "  → place insuffisante : la sauvegarde refuserait de démarrer"; fi
  echo "Phrase      : $PASSFILE (droits corrects)"
  if [ -z "$REMOTE" ]; then
    echo "Hors serveur: AUCUNE copie (KIRAKU_BACKUP_REMOTE vide) : une perte du VPS emporterait les sauvegardes"
  elif ! command -v rclone >/dev/null; then
    echo "Hors serveur: rclone introuvable"
  elif rclone lsf --max-depth 1 "$REMOTE" >/dev/null 2>&1; then
    echo "Hors serveur: destination rclone joignable"
  else
    echo "Hors serveur: destination rclone INJOIGNABLE (rclone lsf \"\$KIRAKU_BACKUP_REMOTE\" pour le détail)"
  fi
  if [ -n "$PING_URL" ]; then echo "Surveillance: réglée"; else echo "Surveillance: aucune (KIRAKU_BACKUP_PING_URL vide)"; fi
  exit 0
fi

[ "$AVAIL_KB" -ge "$NEED_KB" ] || fail 2 "place insuffisante : $((AVAIL_KB / 1024)) Mo libres sur le disque de $DIR, $((NEED_KB / 1024)) Mo demandés"

# --- Dump chiffré à la volée, puis vérification ---
CODE=2
NAME="kiraku-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
DAILY="$DIR/daily/$NAME"
PARTIAL="$DIR/daily/.$NAME.partial"
log "Sauvegarde de $DB_NAME ($WHERE)…"
# Archive déjà compressée par pg_dump : gpg ne la recompresse pas
if ! dump | gpg "${gpg_opts[@]}" --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --compress-algo none --output "$PARTIAL"; then
  fail 2 "pg_dump ou chiffrement en échec (message de pg_dump ou de gpg juste au-dessus)"
fi

# Déchiffrement complet : vérifie l'intégrité de toute l'archive et la phrase de passe
decrypt "$PARTIAL" >/dev/null || fail 2 "archive illisible au déchiffrement"
# Table des matières : pg_restore s'arrête après elle, d'où le déchiffrement interrompu ignoré ici
CONTENTS=$({ decrypt "$PARTIAL" 2>/dev/null || true; } | toc) || fail 2 "table des matières illisible (pg_restore --list)"
for table in User _prisma_migrations; do
  grep -Eq " TABLE DATA public \"?${table}\"?( |\$)" <<<"$CONTENTS" || fail 2 "table $table absente de l'archive"
done
TABLES=$(grep -c ' TABLE DATA ' <<<"$CONTENTS" || true)

mv -f -- "$PARTIAL" "$DAILY"
PARTIAL=""
(cd "$DIR/daily" && sha256sum "$NAME" >"$NAME.sha256")

# --- Rotation ---
WEEKLY_NAME="kiraku-$(date -u +%G-W%V).dump.gpg"
WEEKLY=""
if [ ! -e "$DIR/weekly/$WEEKLY_NAME" ]; then
  # Lien physique : même fichier, aucune place en plus ; il survit à l'effacement de la quotidienne
  ln -- "$DAILY" "$DIR/weekly/$WEEKLY_NAME" 2>/dev/null || cp -p -- "$DAILY" "$DIR/weekly/$WEEKLY_NAME"
  (cd "$DIR/weekly" && sha256sum "$WEEKLY_NAME" >"$WEEKLY_NAME.sha256")
  WEEKLY="$DIR/weekly/$WEEKLY_NAME"
fi
prune_local "$DIR/daily" "$KEEP_DAILY"
prune_local "$DIR/weekly" "$KEEP_WEEKLY"
log "Archive vérifiée : $NAME, $(du -h "$DAILY" | cut -f1), $TABLES tables avec données ; gardées : $(archives "$DIR/daily" | wc -l) quotidiennes, $(archives "$DIR/weekly" | wc -l) hebdomadaires."

# --- Copie hors du serveur (la destination n'est jamais écrite dans le journal : elle peut porter des accès) ---
remote_prune() {
  local sub=$1 keep=$2 listing old olds
  # Dossier encore absent de la destination (hebdomadaires réglées en cours de semaine) : rien à effacer
  listing=$(rclone lsf --files-only --include 'kiraku-*.dump.gpg' "$REMOTE/$sub" 2>/dev/null) || listing=""
  mapfile -t olds < <(sed '/^$/d' <<<"$listing" | sort | head -n -"$keep")
  for old in "${olds[@]}"; do
    rclone deletefile -q "$REMOTE/$sub/$old" || return 1
    rclone deletefile -q "$REMOTE/$sub/$old.sha256" 2>/dev/null || true
  done
}
# Appelée dans un « if » : set -e n'y joue pas, chaque étape renvoie son échec elle-même
remote_copy() {
  command -v rclone >/dev/null || { log "rclone introuvable."; return 1; }
  rclone copyto -q "$DAILY" "$REMOTE/daily/$NAME" || return 1
  rclone copyto -q "$DAILY.sha256" "$REMOTE/daily/$NAME.sha256" || return 1
  if [ -n "$WEEKLY" ]; then
    rclone copyto -q "$WEEKLY" "$REMOTE/weekly/$WEEKLY_NAME" || return 1
    rclone copyto -q "$WEEKLY.sha256" "$REMOTE/weekly/$WEEKLY_NAME.sha256" || return 1
  fi
  if [ "$REMOTE_PRUNE" = 1 ]; then
    remote_prune daily "$KEEP_DAILY" || return 1
    remote_prune weekly "$KEEP_WEEKLY" || return 1
  fi
}
STATUS=0
if [ -z "$REMOTE" ]; then
  log "AVERTISSEMENT : aucune copie hors du serveur (KIRAKU_BACKUP_REMOTE vide) : une perte du VPS emporterait aussi les sauvegardes."
elif remote_copy; then
  log "Copiée hors du serveur."
else
  STATUS=3
  log "ÉCHEC (code 3) : copie hors du serveur impossible ; la sauvegarde locale est gardée."
fi

trap - ERR
if [ "$STATUS" = 0 ]; then monitor; else monitor fail; fi
log "Terminé en $(($(date +%s) - START)) s (code $STATUS)."
exit "$STATUS"
