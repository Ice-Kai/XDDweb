import { getSetting, setSetting } from './settings';
import { aiGenerationPrice } from './ai-pricing';

export type AiModelStatus = 'available' | 'degraded' | 'unavailable';

export interface AiModelSelection {
  model: string;
  label: string;
  resolution: string;
  providerModel: string;
  creditCost: number;
  status: AiModelStatus;
  enabled: boolean;
  lastCheckedAt: string;
}

type StoredHealth = {
  status: AiModelStatus;
  failures: number;
  lastCheckedAt: string;
  lastSuccessAt?: string;
  lastError?: string;
};

type StoredHealthMap = Record<string, StoredHealth>;

const SETTINGS_KEY = 'ai_model_health';
const PRICE_SETTINGS_KEY = 'ai_model_prices';
type StoredPriceMap = Record<string, number>;
const MODELS = [
  { model: 'image2', label: 'image2', resolutions: ['1K'] },
  { model: 'gpt-image-2', label: 'GPT Image', resolutions: ['1K', '2K', '4K'] },
  { model: 'nano_banana_2', label: 'Banana', resolutions: ['1K'] },
  { model: 'nano_banana_pro', label: 'Banana Pro', resolutions: ['1K', '2K', '4K'] },
] as const;

// After a model is greyed to 'unavailable', re-open it as 'degraded' once this
// cooldown passes so a real request can re-test it. Without this the model would
// stay unavailable forever: greyed models can't be selected, so they never get a
// success to clear the failure. This is a standard circuit-breaker half-open.
const UNAVAILABLE_COOLDOWN_MS = 10 * 60 * 1000;
// How many consecutive failures (without an interleaving success) grey a model out
// for everyone. Kept above 2 so a couple of unlucky transient upstream errors on a
// high-res model (which legitimately fail ~50% of the time) don't lock it for all
// users. A single success resets the counter.
const UNAVAILABLE_FAILURE_THRESHOLD = 4;

function keyFor(model: string, resolution: string) {
  return `${model}@${resolution}`;
}

// 'available' and 'degraded' are both usable (degraded shows a "可能不稳定" hint
// and can self-heal on the next success). Only 'unavailable' is blocked.
function statusEnabled(status: AiModelStatus) {
  return status !== 'unavailable';
}

// Apply the half-open cooldown to whatever is stored, so callers see the effective
// status without needing a background job.
function effectiveStatus(stored: StoredHealth): AiModelStatus {
  if (stored.status === 'unavailable' && stored.lastCheckedAt) {
    const age = Date.now() - new Date(stored.lastCheckedAt).getTime();
    if (Number.isFinite(age) && age > UNAVAILABLE_COOLDOWN_MS) return 'degraded';
  }
  return stored.status;
}

function defaultHealth(model: string): StoredHealth {
  // Every model below is documented by the provider and starts open. Real
  // requests still downgrade an unhealthy model automatically.
  return {
    status: MODELS.some((item) => item.model === model) ? 'available' : 'unavailable',
    failures: 0,
    lastCheckedAt: '',
  };
}

function providerModelFor(model: string, resolution: string) {
  if (model === 'image2') return 'image2';
  if (model === 'gpt-image-2') return resolution === '1K' ? 'gpt-image-2' : `gpt-image-2-${resolution}`;
  if (model === 'nano_banana_2') return 'nano_banana_2';
  if (model === 'nano_banana_pro') return `nano_banana_pro-${resolution}`;
  return '';
}

function findDefinition(model: string, resolution: string) {
  const definition = MODELS.find((item) => item.model === model);
  if (!definition || !definition.resolutions.includes(resolution as never)) return null;
  return definition;
}

async function loadHealth() {
  return getSetting<StoredHealthMap>(SETTINGS_KEY, {});
}

async function saveHealth(health: StoredHealthMap) {
  await setSetting(SETTINGS_KEY, health);
}

async function loadPrices() {
  return getSetting<StoredPriceMap>(PRICE_SETTINGS_KEY, {});
}

function effectiveCreditCost(prices: StoredPriceMap, model: string, resolution: string) {
  const override = Number(prices[keyFor(model, resolution)]);
  return Number.isInteger(override) && override > 0
    ? override
    : aiGenerationPrice(model, resolution)?.credits || 0;
}

export async function getAiModelSelection(modelInput: unknown, resolutionInput: unknown): Promise<AiModelSelection | null> {
  const model = typeof modelInput === 'string' ? modelInput.trim() : 'image2';
  const resolution = typeof resolutionInput === 'string' ? resolutionInput.trim() : '1K';
  const definition = findDefinition(model, resolution);
  if (!definition) return null;
  const [health, prices] = await Promise.all([loadHealth(), loadPrices()]);
  const stored = health[keyFor(model, resolution)] || defaultHealth(model);
  const status = effectiveStatus(stored);
  return {
    model,
    label: definition.label,
    resolution,
    providerModel: providerModelFor(model, resolution),
    creditCost: effectiveCreditCost(prices, model, resolution),
    status,
    enabled: statusEnabled(status),
    lastCheckedAt: stored.lastCheckedAt || '',
  };
}

export async function getAiModelCatalog() {
  const [health, prices] = await Promise.all([loadHealth(), loadPrices()]);
  return MODELS.map((definition) => ({
    id: definition.model,
    label: definition.label,
    resolutions: definition.resolutions.map((resolution) => {
      const stored = health[keyFor(definition.model, resolution)] || defaultHealth(definition.model);
      const status = effectiveStatus(stored);
      return {
        value: resolution,
        creditCost: effectiveCreditCost(prices, definition.model, resolution),
        status,
        enabled: statusEnabled(status),
        lastCheckedAt: stored.lastCheckedAt || '',
      };
    }),
  }));
}

export async function setAiModelPrice(modelInput: unknown, resolutionInput: unknown, creditCostInput: unknown) {
  const model = typeof modelInput === 'string' ? modelInput.trim() : '';
  const resolution = typeof resolutionInput === 'string' ? resolutionInput.trim() : '';
  if (!findDefinition(model, resolution)) return null;
  const creditCost = Number(creditCostInput);
  if (!Number.isInteger(creditCost) || creditCost < 1 || creditCost > 100000) return null;
  const prices = await loadPrices();
  prices[keyFor(model, resolution)] = creditCost;
  await setSetting(PRICE_SETTINGS_KEY, prices);
  return getAiModelSelection(model, resolution);
}

export async function recordAiModelSuccess(selection: AiModelSelection) {
  const health = await loadHealth();
  health[keyFor(selection.model, selection.resolution)] = {
    status: 'available',
    failures: 0,
    lastCheckedAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
  };
  await saveHealth(health);
}

export async function recordAiModelFailure(selection: AiModelSelection, kind: 'permanent' | 'transient', message = '') {
  const health = await loadHealth();
  const key = keyFor(selection.model, selection.resolution);
  const current = health[key] || defaultHealth(selection.model);
  // If the breaker had already half-opened (cooldown elapsed, so the effective status
  // is no longer 'unavailable') the stored failure count is stale from the previous
  // outage. This failure is the first probe of a fresh window — start counting from
  // zero so one failed probe can't instantly re-grey the model.
  const halfOpened = current.status === 'unavailable' && effectiveStatus(current) !== 'unavailable';
  const failures = (halfOpened ? 0 : current.failures) + 1;
  health[key] = {
    status: kind === 'permanent' || failures >= UNAVAILABLE_FAILURE_THRESHOLD ? 'unavailable' : 'degraded',
    failures,
    lastCheckedAt: new Date().toISOString(),
    lastSuccessAt: current.lastSuccessAt,
    lastError: message.slice(0, 160),
  };
  await saveHealth(health);
}

export async function resetAiModelHealth(modelInput: unknown, resolutionInput: unknown) {
  const selection = await getAiModelSelection(modelInput, resolutionInput);
  if (!selection) return null;
  const health = await loadHealth();
  // A conscious admin retry reopens a grey model. The next real request either
  // confirms it with a success or automatically greys it again on failure.
  health[keyFor(selection.model, selection.resolution)] = {
    status: 'available',
    failures: 0,
    lastCheckedAt: new Date().toISOString(),
  };
  await saveHealth(health);
  return getAiModelSelection(selection.model, selection.resolution);
}
