import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRoute<Req extends Request = Request, Res extends Response = Response> = (
  req: Req,
  res: Res,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler = <Req extends Request = Request, Res extends Response = Response>(
  handler: AsyncRoute<Req, Res>
): RequestHandler => {
  return (req, res, next) => {
    void Promise.resolve(handler(req as Req, res as Res, next)).catch(next);
  };
};
