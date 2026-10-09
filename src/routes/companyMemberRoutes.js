import express from 'express';
import { authenticateCallCenter } from '../middleware/callCenterAuth.js';
import {
  getCompanyMemberCatalog,
  getMyCompanyAccess,
  listCompanyMembers,
  inviteCompanyMember,
  updateCompanyMember,
  removeCompanyMember,
} from '../controllers/companyMemberController.js';

const router = express.Router();

router.use(authenticateCallCenter);
router.get('/catalog', getCompanyMemberCatalog);
router.get('/me', getMyCompanyAccess);
router.get('/', listCompanyMembers);
router.post('/', inviteCompanyMember);
router.patch('/:userId', updateCompanyMember);
router.delete('/:userId', removeCompanyMember);

export default router;
