// Categories describe the observed issue; they are not a fixed taxonomy.
function normalizeCategory(value) {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) throw new Error('类别应为不含控制字符的简短文字');
  const label = value.trim();
  if (!label || Array.from(label).length > 64) throw new Error('类别需为 1–64 个字符');
  return label;
}
module.exports = { normalizeCategory };
