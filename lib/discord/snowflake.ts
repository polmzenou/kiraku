// Date de création d'un compte Discord, lue dans son identifiant (snowflake) : les bits au-dessus du 22e sont les
// millisecondes écoulées depuis l'époque Discord (1er janvier 2015, UTC). Sert à la confiance du parrainage v2.

const DISCORD_EPOCH = 1_420_070_400_000n;
const MAX_SNOWFLAKE = (1n << 64n) - 1n;
const DIGITS = /^\d{5,20}$/;

/** Instant de création, ou null si l'identifiant n'est pas un snowflake. */
export function snowflakeDate(id: string): Date | null {
  if (!DIGITS.test(id)) return null;
  const value = BigInt(id);
  if (value > MAX_SNOWFLAKE) return null;
  return new Date(Number((value >> 22n) + DISCORD_EPOCH));
}
