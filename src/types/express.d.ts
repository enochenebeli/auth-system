// This extends Express's built-in Request type to include our
// user payload. Without this, TypeScript complains whenever we
// access req.user['sub'] in a controller because it doesn't know
// what shape req.user has.
declare namespace Express {
  interface User {
    sub: string;
    email: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  }
}
