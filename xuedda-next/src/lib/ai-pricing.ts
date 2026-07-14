export const CREDITS_PER_YUAN = 100;
export const PRICE_MULTIPLIER = 3;

type PriceDefinition = {
  upstreamYuan: number;
  saleYuan?: number;
};

const PRICE_TABLE: Record<string, PriceDefinition> = {
  'image2@1K': { upstreamYuan: 0.05 },
  'gpt-image-2@1K': { upstreamYuan: 0.05, saleYuan: 0.6 },
  'gpt-image-2@2K': { upstreamYuan: 0.1, saleYuan: 1 },
  'gpt-image-2@4K': { upstreamYuan: 0.1, saleYuan: 1.5 },
  'nano_banana_2@1K': { upstreamYuan: 0.15 },
  'nano_banana_pro@1K': { upstreamYuan: 0.2, saleYuan: 0.6 },
  'nano_banana_pro@2K': { upstreamYuan: 0.2, saleYuan: 1 },
  // High-resolution output tiers use explicit retail prices.
  'nano_banana_pro@4K': { upstreamYuan: 0.2, saleYuan: 1.5 },
};

export function aiGenerationPrice(model: string, resolution: string) {
  const price = PRICE_TABLE[`${model}@${resolution}`];
  if (!price) return null;
  const saleYuan = price.saleYuan ?? price.upstreamYuan * PRICE_MULTIPLIER;
  const credits = Math.round(saleYuan * CREDITS_PER_YUAN);
  return {
    ...price,
    credits,
    saleYuan,
    multiplier: PRICE_MULTIPLIER,
  };
}
