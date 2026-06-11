export type UserRecord = {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export function toAuthUser(row: UserRecord): AuthUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phoneNumber: row.phone_number,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
