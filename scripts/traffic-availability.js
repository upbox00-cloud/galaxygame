// Local-only management; never writes store prices, inventory systems, or checkout.
const fs = require('node:fs');
const path = require('node:path');
const { validateDocument, currentConfirmation } = require('../netlify/functions/_traffic-catalog');

function updateAvailability(document, args, catalog, now = Date.now()) {
  validateDocument(document);
  const [command, id, ...flags] = args;
  if (!['confirm', 'withdraw', 'promotion', 'clear-promotion'].includes(command) || !catalog.some((p) => p.id === id)) throw new Error('Invalid command or unknown product ID');
  const options = {};
  for (const flag of flags) {
    const match = /^--(until|by|price|original|starts|ends)=(.+)$/.exec(flag);
    if (!match || Object.hasOwn(options, match[1])) throw new Error('Invalid or duplicate option');
    options[match[1]] = match[2];
  }
  const allowed = command === 'confirm' ? ['until', 'by'] : command === 'promotion' ? ['price', 'original', 'starts', 'ends'] : [];
  if (Object.keys(options).some((key) => !allowed.includes(key))) throw new Error('Option not supported for command');
  const result = structuredClone(document);
  const entry = Object.hasOwn(result.confirmations, id) ? result.confirmations[id] : {};
  if (command === 'confirm') {
    if (!options.by?.trim() || options.by.length > 120 || !Number.isFinite(Date.parse(options.until)) || Date.parse(options.until) <= now) throw new Error('Confirmation needs --by and future --until');
    result.confirmations[id] = { available: true, checkedBy: options.by.trim(), confirmedAt: new Date(now).toISOString(), validUntil: new Date(options.until).toISOString() };
  } else if (command === 'withdraw') {
    result.confirmations[id] = { ...entry, available: false };
    delete result.confirmations[id].promotion;
  } else if (command === 'clear-promotion') {
    result.confirmations[id] = { ...entry };
    delete result.confirmations[id].promotion;
  } else {
    const price = Number(options.price);
    const originalPrice = Number(options.original);
    const starts = Date.parse(options.starts);
    const ends = Date.parse(options.ends);
    if (!currentConfirmation(entry, now) || !Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(originalPrice) || originalPrice <= price || originalPrice > 99999 || !Number.isFinite(starts) || !Number.isFinite(ends) || starts >= ends || ends <= now || ends > Date.parse(entry.validUntil)) throw new Error('Promotion needs active confirmation, valid cents and window within confirmation');
    result.confirmations[id] = { ...entry, promotion: { confirmed: true, price, originalPrice, startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() } };
  }
  return result;
}

function main(args) {
  const filename = path.resolve(__dirname, '../netlify/functions/_data/traffic-availability.json');
  const document = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/catalog-lite.json'), 'utf8'));
  const updated = updateAvailability(document, args, catalog);
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(updated, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log('Private availability metadata updated locally; deployment remains manual.');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { updateAvailability };
