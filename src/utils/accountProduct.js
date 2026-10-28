/** Produit HARX auquel un compte appartient : un compte du produit Call Centre se connecte toujours dans Call Centre. */
export const PRODUCTS = ['callcentre'];

/** @returns {'callcentre'|null} le produit demandé s'il est connu, sinon null. */
export function parseProduct(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return PRODUCTS.includes(v) ? v : null;
}
