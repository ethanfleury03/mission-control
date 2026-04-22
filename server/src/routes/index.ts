import { Router } from 'express';
import teamsRoutes from './teams';
import registryRoutes from './registry';
import commandsRoutes from './commands';
import orgRoutes from './org';

const router = Router();

router.use('/teams', teamsRoutes);
router.use('/registry', registryRoutes);
router.use('/commands', commandsRoutes);
router.use('/org', orgRoutes);

export default router;
