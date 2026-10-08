import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;


export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
  const id = req.headers['x-user-id'];
  if (!id || !USER_ID_PATTERN.test(id)) {
    throw new BadRequestException({
      code: 'INVALID_USER',
      message: 'Missing or invalid x-user-id header (8-64 chars: letters, digits, _ or -).',
    });
  }
  return id;
});