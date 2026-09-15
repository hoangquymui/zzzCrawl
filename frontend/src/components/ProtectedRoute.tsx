import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactElement;
  requiredRole?: 'admin' | 'user';
  allowGuest?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  allowGuest = false,
}) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  // Đang kiểm tra token
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Nếu cho phép khách
  if (allowGuest) {
    return children;
  }

  // Nếu chưa đăng nhập: chuyển hướng về Dashboard
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Nếu trang yêu cầu quyền Admin mà người dùng không phải Admin: chuyển hướng về Dashboard
  if (requiredRole === 'admin' && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};
