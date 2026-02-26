declare global {
  namespace Express {
    interface Request {
      agentId?: string;
    }
  }
}

export {};
