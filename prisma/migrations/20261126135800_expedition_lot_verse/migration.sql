-- Expéditions : résumé du lot bonus réellement versé à la clôture ({ zeni, boosters: [{ boosterTypeId, count }] }),
-- pour que le rapport et le journal montrent ses Zeni et ses boosters. Nul : aucun lot versé, ou expédition close
-- avant cette migration (rapport et journal s'en tiennent alors aux gains de la photo).

-- AlterTable
ALTER TABLE "Expedition" ADD COLUMN     "lotGrant" JSONB;
