import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'admin' | 'user'>) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Array<'admin' | 'user'>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    const user = this.authService.verifyToken(authHeader);

    if (!user) {
      throw new UnauthorizedException('Bạn cần đăng nhập để thực hiện chức năng này.');
    }

    request.user = user;

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện thao tác này (Yêu cầu quyền Quản trị viên - Admin).'
      );
    }

    return true;
  }
}
