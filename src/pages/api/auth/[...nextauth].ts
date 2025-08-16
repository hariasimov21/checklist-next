import NextAuth, { type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email ?? "";
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name ?? null };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (user) (token as any).uid = (user as any).id;
      return token;
    },
    async session({ session, token }) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((token as any)?.uid && session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as unknown as { id: string }).id = (token as any).uid as string;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
