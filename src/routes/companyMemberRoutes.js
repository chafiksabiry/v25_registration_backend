import express from 'express';
import { authenticateCallCenter } from '../middleware/callCenterAuth.js';
import {
  getCompanyMemberCatalog,
  getMyCompanyAccess,
  listCompanyMembers,
  inviteCompanyMember,
  touchCompanyMemberPresence,
  reinviteCompanyMember,
  updateCompanyMember,
  removeCompanyMember,
  listCompanyRoles,
  createCompanyRole,
  updateCompanyRole,
  deleteCompanyRole,
} from '../controllers/companyMemberController.js';

const router = express.Router();

router.use(authenticateCallCenter);
router.get('/catalog', getCompanyMemberCatalog);
router.get('/me', getMyCompanyAccess);
router.get('/', listCompanyMembers);
router.post('/', inviteCompanyMember);
router.post('/presence', touchCompanyMemberPresence);
router.get('/roles', listCompanyRoles);
router.post('/roles', createCompanyRole);
router.patch('/roles/:roleId', updateCompanyRole);
router.delete('/roles/:roleId', deleteCompanyRole);
router.post('/:userId/reinvite', reinviteCompanyMember);
router.patch('/:userId', updateCompanyMember);
router.delete('/:userId', removeCompanyMember);

export default router;
