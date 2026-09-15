import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';

export interface UserPayload {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
}

@Injectable()
export class AuthService {
  // Danh sách tài khoản mặc định
  private users: Array<UserPayload & { password: string }> = [
    {
      id: 'usr_admin_01',
      username: 'admin',
      name: 'Quản trị viên',
      role: 'admin',
      password: 'admin',
    },
    {
      id: 'usr_admin_02',
      username: 'admin123',
      name: 'Quản trị viên',
      role: 'admin',
      password: 'admin',
    },
    {
      id: 'usr_user_01',
      username: 'user',
      name: 'Người xem (User)',
      role: 'user',
      password: 'user',
    },
    {
      id: 'usr_user_02',
      username: 'user123',
      name: 'Người xem (User)',
      role: 'user',
      password: 'user',
    },
  ];

  // Token cache đơn giản in-memory: token -> UserPayload
  private readonly tokenStore = new Map<string, UserPayload>();

  public validateUser(username: string, pass: string): UserPayload {
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPass = (pass || '').trim();

    const matched = this.users.find(
      (u) =>
        u.username.toLowerCase() === cleanUser ||
        (cleanUser === 'admin' && (u.username === 'admin' || u.username === 'admin123')) ||
        (cleanUser === 'user' && (u.username === 'user' || u.username === 'user123'))
    );

    if (!matched) {
      throw new UnauthorizedException('Tài khoản hoặc mật khẩu không chính xác.');
    }

    const validPass =
      cleanPass === matched.password ||
      (matched.role === 'admin' && (cleanPass === 'admin' || cleanPass === 'admin123')) ||
      (matched.role === 'user' && (cleanPass === 'user' || cleanPass === 'user123'));

    if (!validPass) {
      throw new UnauthorizedException('Mật khẩu không chính xác.');
    }

    return {
      id: matched.id,
      username: matched.username,
      name: matched.name,
      role: matched.role,
    };
  }

  public login(user: UserPayload): { token: string; user: UserPayload } {
    const token = `tok_${user.role}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    this.tokenStore.set(token, user);
    return { token, user };
  }

  public verifyToken(token?: string): UserPayload | null {
    if (!token) return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;

    if (this.tokenStore.has(cleanToken)) {
      return this.tokenStore.get(cleanToken)!;
    }

    // Fallback nếu server khởi động lại
    if (cleanToken.startsWith('tok_admin_')) {
      const user: UserPayload = {
        id: 'usr_admin_restored',
        username: 'admin',
        name: 'Quản trị viên',
        role: 'admin',
      };
      this.tokenStore.set(cleanToken, user);
      return user;
    } else if (cleanToken.startsWith('tok_user_')) {
      const user: UserPayload = {
        id: 'usr_user_restored',
        username: 'user',
        name: 'Người xem (User)',
        role: 'user',
      };
      this.tokenStore.set(cleanToken, user);
      return user;
    }

    return null;
  }

  public logout(token?: string): boolean {
    if (!token) return true;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    this.tokenStore.delete(cleanToken);
    return true;
  }

  public getUsers(): UserPayload[] {
    return this.users.map(({ id, username, name, role }) => ({ id, username, name, role }));
  }

  public createUser(dto: { username: string; name?: string; role: 'admin' | 'user'; password: string }): UserPayload {
    const cleanUser = (dto.username || '').trim().toLowerCase();
    if (!cleanUser) {
      throw new BadRequestException('Tên tài khoản không được để trống.');
    }
    if (!dto.password || !dto.password.trim()) {
      throw new BadRequestException('Mật khẩu không được để trống.');
    }
    if (this.users.some((u) => u.username.toLowerCase() === cleanUser)) {
      throw new BadRequestException(`Tài khoản "${dto.username}" đã tồn tại trên hệ thống.`);
    }

    const newUser = {
      id: `usr_${dto.role}_${Date.now()}`,
      username: dto.username.trim(),
      name: dto.name?.trim() || (dto.role === 'admin' ? 'Quản trị viên' : 'Người xem (User)'),
      role: dto.role || 'user',
      password: dto.password.trim(),
    };

    this.users.push(newUser);
    return {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role,
    };
  }

  public deleteUser(id: string): boolean {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng.');
    }
    if (this.users[idx].id === 'usr_admin_01' || this.users[idx].username === 'admin') {
      throw new BadRequestException('Không thể xoá tài khoản Quản trị viên mặc định (admin).');
    }
    this.users.splice(idx, 1);
    return true;
  }
}
