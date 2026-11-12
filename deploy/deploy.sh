#!/usr/bin/env bash
# Déploiement de Kiraku sur le VPS, sans coupure pour les joueurs (mode d'emploi : deploy/README.md).
#
#   bash deploy/deploy.sh              git pull, build, migrations, bascule
#   bash deploy/deploy.sh --seed       idem, puis les seeds de départ (boosters, pages légales)
#   bash deploy/deploy.sh --typecheck  garde la vérification des types même si la CI est verte
#   bash deploy/deploy.sh --rollback   revient à la release précédente (ni build ni migration)
#
# Le site continue de tourner pendant tout le build : il sert une release copiée à part
# (~/kiraku-releases/current), jamais les fichiers que le build réécrit. La nouvelle version démarre
# d'abord en secours sur le port 3001 ; elle ne remplace celle du port 3000 qu'une fois qu'elle répond.
# Nginx envoie les joueurs au secours pendant les quelques secondes du redémarrage (deploy/nginx.conf.example).
set -Eeuo pipefail

SRC="${KIRAKU_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ROOT="${KIRAKU_RELEASES:-$HOME/kiraku-releases}"
APP="${KIRAKU_PM2_NAME:-kiraku}"
STANDBY="$APP-standby"
PORT="${KIRAKU_PORT:-3000}"
STANDBY_PORT="${KIRAKU_STANDBY_PORT:-3001}"
KEEP="${KIRAKU_KEEP_RELEASES:-3}"

SEED=0 TYPECHECK=0 ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --typecheck) TYPECHECK=1 ;;
    --rollback) ROLLBACK=1 ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "Échec à la ligne $LINENO : la version en ligne n’a pas changé (sauf mention contraire plus haut)."' ERR

command -v pm2 >/dev/null || die "pm2 introuvable."
mkdir -p "$ROOT/releases"
exec 9>"$ROOT/.lock"
flock -n 9 || die "Un déploiement est déjà en cours."
START=$(date +%s)
CURRENT=$(readlink -f "$ROOT/current" 2>/dev/null || true)

# Prête quand la base répond (/api/health) et que l'accueil s'affiche en entier.
healthy() {
  local port=$1 code
  for _ in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$port/api/health" || true)
    if [ "$code" = 200 ]; then
      code=$(curl -s -o /dev/null -w '%{http_code}' -m 30 -H 'Cookie: NEXT_LOCALE=fr' "http://127.0.0.1:$port/" || true)
      [ "$code" = 200 ] && return 0
    fi
    sleep 3
  done
  return 1
}

# HOSTNAME=0.0.0.0, comme `next start` : avec 127.0.0.1, Next prend la réécriture de next-intl vers /fr pour
# une adresse externe et l'accueil boucle sur lui-même. Le pare-feu garde les ports 3000-3001 fermés.
pm2_run() {
  local name=$1 dir=$2 port=$3
  pm2 delete "$name" >/dev/null 2>&1 || true
  (cd "$dir" && PORT="$port" HOSTNAME=0.0.0.0 NODE_ENV=production pm2 start server.js --name "$name" --cwd "$dir" --time >/dev/null)
}

switch_to() {
  local rel=$1
  step "Démarrage de $(basename "$rel") en secours (port $STANDBY_PORT)"
  pm2_run "$STANDBY" "$rel" "$STANDBY_PORT"
  if ! healthy "$STANDBY_PORT"; then
    pm2 delete "$STANDBY" >/dev/null 2>&1 || true
    die "La nouvelle version ne répond pas (pm2 logs $STANDBY) : les joueurs restent sur l'ancienne."
  fi
  info "Elle répond."

  step "Bascule (les joueurs passent par le secours pendant le redémarrage)"
  ln -sfn "$rel" "$ROOT/current"
  pm2_run "$APP" "$rel" "$PORT"
  if ! healthy "$PORT"; then
    die "Le port $PORT ne répond pas (pm2 logs $APP). Le secours sur $STANDBY_PORT, déjà à jour, sert les joueurs en attendant : ne pas l'arrêter."
  fi
  pm2 delete "$STANDBY" >/dev/null 2>&1 || true
  pm2 save >/dev/null
  info "En ligne : $(basename "$rel")"
}

if [ "$ROLLBACK" = 1 ]; then
  [ -n "$CURRENT" ] || die "Aucune release en ligne."
  PREVIOUS=$(ls -1d "$ROOT"/releases/*/ | sed 's#/$##' | sort | grep -B1 -Fx "$CURRENT" | head -n 1)
  [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$CURRENT" ] || die "Pas de release plus ancienne que $(basename "$CURRENT")."
  switch_to "$PREVIOUS"
  info "Retour arrière en $(($(date +%s) - START)) s. Les migrations ne sont pas annulées."
  exit 0
fi

cd "$SRC"
step "Code"
git pull --ff-only
SHA=$(git rev-parse HEAD)
info "$(git log -1 --format='%h %s')"

step "Dépendances"
LOCK_HASH=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ -d node_modules ] && [ "$(cat "$ROOT/.lock-hash" 2>/dev/null || true)" = "$LOCK_HASH" ]; then
  info "package-lock.json inchangé : npm ci sauté."
else
  nice -n 10 npm ci --no-audit --no-fund
  echo "$LOCK_HASH" > "$ROOT/.lock-hash"
fi
node scripts/check-deploy-env.mjs

# La CI (lint, types, tests) est-elle verte pour ce commit ? Si oui, le build ne refait pas le typecheck.
ci_green() {
  local repo json
  repo=$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://([^@/]*@)?github\.com/)##; s#\.git$##')
  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    json=$(gh api "repos/$repo/commits/$SHA/check-runs?check_name=checks" 2>/dev/null) || return 1
  else
    local auth=()
    [ -r "$HOME/.config/kiraku/github-token" ] && auth=(-H "Authorization: Bearer $(cat "$HOME/.config/kiraku/github-token")")
    json=$(curl -fsS -m 15 "${auth[@]}" -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$repo/commits/$SHA/check-runs?check_name=checks" 2>/dev/null) || return 1
  fi
  node -e 'const r = JSON.parse(require("fs").readFileSync(0, "utf8")); process.exit(r.check_runs?.some((c) => c.status === "completed" && c.conclusion === "success") ? 0 : 1)' <<<"$json"
}

step "Build (priorité basse : le site en ligne passe d'abord)"
SKIP=0
if [ "$TYPECHECK" = 0 ] && ci_green; then
  SKIP=1
  info "CI verte pour ce commit : vérification des types sautée (déjà faite par la CI)."
else
  info "CI pas confirmée verte (en cours, en échec ou illisible) : le build vérifie les types."
fi
SKIP_BUILD_TYPECHECK=$SKIP nice -n 10 npm run build

step "Migrations"
npx prisma migrate deploy
if [ "$SEED" = 1 ]; then
  step "Seeds de départ"
  npx tsx scripts/seed-boosters.mts
  npx tsx scripts/seed-legal.mts
fi

step "Release"
REL="$ROOT/releases/$(date +%Y%m%d-%H%M%S)-${SHA:0:7}"
cp -a .next/standalone "$REL"
mkdir -p "$REL/public" "$REL/.next/static"
cp -a public/. "$REL/public/"
cp -a .next/static/. "$REL/.next/static/"
# Fichiers JS/CSS de la version en ligne : un joueur resté sur une page ouverte avant la bascule les charge encore
if [ -n "$CURRENT" ] && [ -d "$CURRENT/.next/static" ]; then
  rsync -a --ignore-existing "$CURRENT/.next/static/" "$REL/.next/static/"
fi
chmod 600 "$REL"/.env* 2>/dev/null || true
info "$(du -sh "$REL" | cut -f1) dans $REL"

switch_to "$REL"

# Ménage : les $KEEP releases les plus récentes restent pour un retour arrière
ls -1dt "$ROOT"/releases/*/ | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$(readlink -f "$old")" = "$(readlink -f "$ROOT/current")" ] || rm -rf "$old"
done

printf '\n\033[1;32m✓ Déployé en %s s.\033[0m\n' "$(($(date +%s) - START))"
