import { parseProduct } from './accountProduct.js';

/**
 * Produit d'un compte invité (membre, agent) : celui de l'inviteur, sinon celui du propriétaire de l'entreprise.
 * Les routes d'invitation (/api/company-members, /api/call-center/agents) sont celles de Call Centre : si ni l'inviteur
 * ni le propriétaire n'ont encore été étiquetés (le front ne le fait qu'à l'ouverture de l'application), le produit
 * est « callcentre ».
 */
export const INVITE_DEFAULT_PRODUCT = 'callcentre';

export async function resolveInviteProduct({ caller, company, findUserById }) {
  const fromCaller = parseProduct(caller?.product);
  if (fromCaller) return fromCaller;
  if (company?.userId && String(company.userId) !== String(caller?._id)) {
    try {
      const owner = await findUserById(company.userId);
      const fromOwner = parseProduct(owner?.product);
      if (fromOwner) return fromOwner;
    } catch (error) {
      console.error('Produit du propriétaire illisible, produit par défaut utilisé :', error?.message || error);
    }
  }
  return INVITE_DEFAULT_PRODUCT;
}

/** Pose le produit si le compte n'en a pas encore ; n'écrase jamais un produit déjà défini (écriture atomique). */
export async function tagProductIfMissing(UserModel, userId, product) {
  const value = parseProduct(product);
  if (!value || !userId) return false;
  const result = await UserModel.updateOne(
    { _id: userId, $or: [{ product: null }, { product: { $exists: false } }] },
    { $set: { product: value } },
  );
  return Number(result?.modifiedCount ?? result?.nModified ?? 0) > 0;
}

/** Étiquette plusieurs comptes (propriétaire, inviteur, invité) ; un échec est journalisé et n'interrompt pas l'invitation. */
export async function tagInviteAccounts(UserModel, userIds, product) {
  const seen = new Set();
  for (const id of userIds) {
    if (!id || seen.has(String(id))) continue;
    seen.add(String(id));
    try {
      await tagProductIfMissing(UserModel, id, product);
    } catch (error) {
      console.error('Étiquetage du produit impossible :', error?.message || error);
    }
  }
}
