// Paiement par carte : interface seulement. Aucun fournisseur n'est branché (voir « Points légaux »
// du plan avant d'en brancher un). Brancher Stripe = écrire stripe.ts qui implémente
// PaymentProvider, une route webhook qui appelle parseWebhook puis fulfillPurchase, et renvoyer le
// fournisseur ici. La boutique, les achats et les lots n'ont rien à changer.
import "server-only";

export type CheckoutInput = {
  /** Purchase créé en PENDING avant la redirection : c'est lui que le webhook confirmera. */
  purchaseId: string;
  item: { name: string; priceCents: number; providerPriceId: string };
  userId: string;
  successUrl: string;
  cancelUrl: string;
};

export type PaymentEvent = {
  type: "paid" | "failed" | "refunded";
  purchaseId: string;
  /** Référence chez le fournisseur (unique en base : un événement rejoué ne livre pas deux fois). */
  providerRef: string;
};

export interface PaymentProvider {
  readonly id: "stripe";
  /** Ouvre une page de paiement hébergée par le fournisseur. */
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string }>;
  /** Vérifie la signature et traduit l'événement ; null pour un événement ignoré. */
  parseWebhook(request: Request): Promise<PaymentEvent | null>;
}

/** Fournisseur configuré, ou null : la zone « Packs premium » reste masquée tant qu'il est null. */
export function getPaymentProvider(): PaymentProvider | null {
  return null;
}
