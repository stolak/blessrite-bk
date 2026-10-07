import { Router } from "express";
import { privilegeController } from "../controllers/privilegeController";

const router = Router();

router.get("/", privilegeController.listPrivileges);

export default router;
