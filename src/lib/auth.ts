// auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import db from "@/lib/db";
import { comparePassword, toStringSafe } from "@/lib/utils";
import { signInSchema } from "@/app/(auth)/sign-in/_types/signInSchema";

// ----- Type augmentation -----
declare module "next-auth" {
  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;                // keep as string for consistency
    name?: string | null;
    email?: string | null;
    role?: string | null;
  }
}

// ----- Auth config -----
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      // Helps with type inference in some editors, optional keys ok
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        // Validate with Zod
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new Error("Email and password are required");
        }
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          throw new Error("Invalid email or password");
        }

        const isValid = await comparePassword(password, user.password);
        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        // Return a User-like object (NextAuth will serialize to JWT)
        return {
          id: toStringSafe(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  pages: {
    signIn: "/sign-in",
  },

  callbacks: {
    // Runs on sign in and on subsequent requests
    jwt({ token, user }) {
      // When a user signs in, persist extra fields onto the token
      if (user) {
        token.id = toStringSafe(user.id);
        token.name = user.name ?? null;
        token.email = user.email ?? null;
        token.role = user.role ?? null;
      }
      return token;
    },

    session({ session, token }) {
      // Mirror token fields to session.user
      if (session.user) {
        session.user.id = toStringSafe(token.id ?? "");
        session.user.name = token.name ?? null;
        session.user.email = token.email ?? null;
        session.user.role = token.role ?? null;
      }
      return session;
    },
  },
});
