import express from 'express';
import { authenticateCallCenter } from '../middleware/callCenterAuth.js';
import {
  getCompanyMemberCatalog,
  getMyCompanyAccess,
  listCompanyMembers,
  inviteCompanyMember,
  reinviteCompanyMember,
  updateCompanyMember,
  removeCompanyMember,
} from '../controllers/companyMemberController.js';

const router = express.Router();

router.use(authenticateCallCenter);
router.get('/catalog', getCompanyMemberCatalog);
router.get('/me', getMyCompanyAccess);
router.get('/', listCompanyMembers);
router.post('/', inviteCompanyMember);
router.post('/:userId/reinvite', reinviteCompanyMember);
router.patch('/:userId', updateCompanyMember);
router.delete('/:userId', removeCompanyMember);

export default router;
