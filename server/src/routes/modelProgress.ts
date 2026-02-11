import { Router, Request, Response } from "express";
import { subscribeModelProgress } from "../ai/modelProgress.js";
import { isReady, getInstance } from "../ai/pipeline.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  if (isReady()) {
    res.write(`data: ${JSON.stringify({ ready: true })}\n\n`);
    res.end();
    return;
  }

  const unsubscribe = subscribeModelProgress((data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.flushHeaders?.();
    if (data.ready) {
      unsubscribe();
      res.end();
    }
  });

  req.on("close", () => {
    unsubscribe();
  });

  getInstance().catch((err) => {
    console.error("[model-progress] getInstance error:", err);
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
    res.end();
  });
});

export default router;
