import { randomUUID } from 'node:crypto';

export const PROFILE = Object.freeze({ network: 'sandbox:local', token: 'mock:USDt', recipient: 'sim:merchant', requiredConfirmations: 3 });
export class ValidationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function fail(code, message) { throw new ValidationError(code, message); }
export function parseAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(value)) fail('AMOUNT_FORMAT', 'Suma trebuie să fie un număr pozitiv cu maximum 6 zecimale, fără exponent sau separator de mii.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (units <= 0n) fail('AMOUNT_ZERO', 'Suma trebuie să fie mai mare decât zero.');
  return units;
}
export function formatAmount(units) {
  if (typeof units !== 'bigint' || units < 0n) fail('INVALID_UNITS', 'Unități invalide.');
  return `${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, '0')}`;
}
function record(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('COMMAND', 'Comandă invalidă.');
  const entries = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(entries).some(key => !fields.includes(key) || !('value' in entries[key])) || fields.some(key => !Object.hasOwn(entries, key))) fail('FIELDS', 'Câmpuri lipsă sau necunoscute.');
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail('TEXT', `${label}: text invalid.`);
  return value.trim();
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(value)) fail('IDENTIFIER', 'Identificator invalid (maximum 80 caractere).');
  return value;
}
export function emptyState() { return { schemaVersion: 1, invoices: [], observations: [], journal: [] }; }

export class Ledger {
  #state;
  #clock;
  #save;
  constructor({ state = emptyState(), clock = Date.now, save = () => {} } = {}) {
    this.#state = validateStoredState(state);
    this.#clock = clock;
    this.#save = save;
  }
  #commit(next, event, detail) {
    next.journal.push({ id: randomUUID(), timestamp: new Date(this.#clock()).toISOString(), event, ...detail });
    this.#save(structuredClone(next));
    this.#state = next;
  }
  createInvoice(input) {
    record(input, ['client', 'amount', 'expiresAt']);
    if (this.#state.invoices.length >= 500) fail('CAPACITY', 'Limita demo de 500 facturi a fost atinsă.');
    if (this.#state.journal.length >= 10000) fail('CAPACITY', 'Limita jurnalului a fost atinsă.');
    const client = text(input.client, 100, 'Client');
    const amount = parseAmount(input.amount).toString();
    if (typeof input.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.expiresAt)) fail('EXPIRY', 'Data expirării este invalidă.');
    const expiry = Date.parse(input.expiresAt);
    const now = this.#clock();
    if (!Number.isFinite(expiry) || new Date(expiry).toISOString() !== input.expiresAt || expiry <= now || expiry > now + 366 * 86400000) fail('EXPIRY', 'Expirarea trebuie să fie în viitor, în următoarele 366 de zile.');
    const next = structuredClone(this.#state);
    const invoice = { id: randomUUID(), number: `INV-${String(next.invoices.length + 1).padStart(4, '0')}`, client, amountUnits: amount, expiresAt: input.expiresAt, createdAt: new Date(now).toISOString() };
    next.invoices.push(invoice);
    this.#commit(next, 'INVOICE_CREATED', { invoiceId: invoice.id, invoiceNumber: invoice.number });
    return invoice.id;
  }
  observe(input) {
    record(input, ['invoiceId', 'transactionId', 'amount', 'confirmations', 'network', 'token', 'recipient']);
    const invoiceId = identifier(input.invoiceId);
    const transactionId = identifier(input.transactionId);
    if (!this.#state.invoices.some(invoice => invoice.id === invoiceId)) fail('INVOICE_UNKNOWN', 'Factura nu există.');
    for (const field of ['network', 'token', 'recipient']) if (input[field] !== PROFILE[field]) fail(`WRONG_${field.toUpperCase()}`, `Observație respinsă: ${field} nu corespunde profilului simulat.`);
    const amountUnits = parseAmount(input.amount).toString();
    if (!Number.isSafeInteger(input.confirmations) || input.confirmations < 0 || input.confirmations > 100000) fail('CONFIRMATIONS', 'Confirmările trebuie să fie un număr întreg între 0 și 100000.');
    const previous = this.#state.observations.find(item => item.transactionId === transactionId);
    if (previous && (previous.invoiceId !== invoiceId || previous.amountUnits !== amountUnits)) fail('TRANSACTION_CONFLICT', 'Identificatorul există cu altă factură sau sumă. Nu poate fi reutilizat.');
    if (previous?.confirmations === input.confirmations) return { duplicate: true, updated: false };
    if (!previous && this.#state.observations.length >= 2000) fail('CAPACITY', 'Limita demo de 2000 observații a fost atinsă.');
    if (this.#state.journal.length >= 10000) fail('CAPACITY', 'Limita jurnalului a fost atinsă.');
    const next = structuredClone(this.#state);
    const now = new Date(this.#clock()).toISOString();
    if (previous) {
      next.observations.find(item => item.transactionId === transactionId).confirmations = input.confirmations;
      next.observations.find(item => item.transactionId === transactionId).updatedAt = now;
    } else next.observations.push({ transactionId, invoiceId, amountUnits, confirmations: input.confirmations, network: PROFILE.network, token: PROFILE.token, recipient: PROFILE.recipient, observedAt: now, updatedAt: now });
    this.#commit(next, previous ? 'CONFIRMATIONS_UPDATED' : 'PAYMENT_OBSERVED', { invoiceId, transactionId, previousConfirmations: previous?.confirmations ?? null, confirmations: input.confirmations, amountUnits });
    return { duplicate: false, updated: Boolean(previous) };
  }
  snapshot() {
    const state = structuredClone(this.#state);
    const now = this.#clock();
    const invoices = state.invoices.map(invoice => {
      const observations = state.observations.filter(item => item.invoiceId === invoice.id);
      const total = observations.reduce((sum, item) => sum + BigInt(item.amountUnits), 0n);
      const confirmed = observations.filter(item => item.confirmations >= PROFILE.requiredConfirmations).reduce((sum, item) => sum + BigInt(item.amountUnits), 0n);
      const due = BigInt(invoice.amountUnits);
      const status = confirmed >= due ? 'paid' : now >= Date.parse(invoice.expiresAt) ? 'expired' : confirmed > 0n ? 'partial' : total > 0n ? 'confirming' : 'pending';
      return { ...invoice, amount: formatAmount(due), confirmed: formatAmount(confirmed), pending: formatAmount(total - confirmed), remaining: formatAmount(due > confirmed ? due - confirmed : 0n), excess: formatAmount(confirmed > due ? confirmed - due : 0n), status, observations };
    });
    return { ...state, invoices, profile: PROFILE, simulation: true, generatedAt: new Date(now).toISOString() };
  }
}

function validateStoredState(state) {
  record(state, ['schemaVersion', 'invoices', 'observations', 'journal']);
  if (state.schemaVersion !== 1 || !Array.isArray(state.invoices) || !Array.isArray(state.observations) || !Array.isArray(state.journal) || state.invoices.length > 500 || state.observations.length > 2000 || state.journal.length > 10000) fail('STORAGE', 'Stocarea locală este invalidă.');
  const ids = new Set();
  for (const invoice of state.invoices) {
    record(invoice, ['id', 'number', 'client', 'amountUnits', 'expiresAt', 'createdAt']);
    identifier(invoice.id); text(invoice.number, 30, 'Număr'); text(invoice.client, 100, 'Client');
    if (ids.has(invoice.id) || typeof invoice.amountUnits !== 'string' || !/^[1-9]\d{0,23}$/.test(invoice.amountUnits) || !Number.isFinite(Date.parse(invoice.expiresAt)) || !Number.isFinite(Date.parse(invoice.createdAt))) fail('STORAGE', 'Factură stocată invalidă.');
    ids.add(invoice.id);
  }
  const transactions = new Set();
  for (const observation of state.observations) {
    record(observation, ['transactionId', 'invoiceId', 'amountUnits', 'confirmations', 'network', 'token', 'recipient', 'observedAt', 'updatedAt']);
    identifier(observation.transactionId);
    if (transactions.has(observation.transactionId) || !ids.has(observation.invoiceId) || typeof observation.amountUnits !== 'string' || !/^[1-9]\d{0,23}$/.test(observation.amountUnits) || !Number.isSafeInteger(observation.confirmations) || observation.confirmations < 0 || observation.confirmations > 100000 || ['network','token','recipient'].some(key => observation[key] !== PROFILE[key]) || !Number.isFinite(Date.parse(observation.observedAt)) || !Number.isFinite(Date.parse(observation.updatedAt))) fail('STORAGE', 'Observație stocată invalidă.');
    transactions.add(observation.transactionId);
  }
  for (const entry of state.journal) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Number.isFinite(Date.parse(entry.timestamp)) || typeof entry.event !== 'string') fail('STORAGE', 'Jurnal stocat invalid.');
  }
  return structuredClone(state);
}
