import express from 'express';
import { createResponse } from '../utils/helpers.js';
import { requireAdminPin, adminActionLimiter } from '../middleware/adminAuth.js';

const router = express.Router({ mergeParams: true });

/**
 * POST /api/:sqid/admin/verify-pin - Check an admin PIN
 * The PIN travels in the X-Admin-Pin header (requireAdminPin reads it);
 * this just turns a pass into a response the UI can key off before
 * caching the PIN for subsequent admin calls.
 */
export function verifyPinHandler(req, res) {
  res.json(createResponse(true, { message: 'PIN verified' }));
}

router.post('/verify-pin', adminActionLimiter, requireAdminPin, verifyPinHandler);

export default router;
