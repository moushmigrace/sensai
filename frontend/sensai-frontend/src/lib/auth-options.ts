import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { registerUserWithBackend } from "@/app/api/auth/[...nextauth]/utils";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        if (user.email) {
          token.email = user.email as string;
        }
        if (user.name) {
          token.name = user.name as string;
        }
      }

      // Ensure backend user id whenever we have a Google id_token but no userId yet
      // (covers first sign-in failure, slow backend, or recovery on later JWT refreshes).
      if (!token.userId && token.idToken) {
        const email =
          (typeof user?.email === "string" && user.email) ||
          (typeof token.email === "string" && token.email);
        if (email) {
          const displayName =
            (typeof user?.name === "string" && user.name) ||
            (typeof token.name === "string" && token.name) ||
            "";
          const parts = displayName.split(/\s+/).filter(Boolean);
          try {
            const result = await registerUserWithBackend(
              {
                email,
                given_name: parts[0] ?? "",
                family_name: parts.slice(1).join(" ") || "",
                name: displayName,
              },
              {
                id_token: token.idToken as string,
                provider: "google",
              },
            );
            if (result?.id != null) {
              token.userId = result.id;
            } else {
              console.error("Backend response missing ID field");
            }
          } catch (error) {
            console.error("Error storing backend user ID:", error);
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        if (token.userId) {
          session.user.id = String(token.userId);
        } else {
          console.log("No userId in token!");
        }

        if (token.accessToken) {
          (session as { accessToken?: string }).accessToken = token.accessToken;
        }
      }

      return session;
    },

    async signIn({ account, profile }) {
      if (!account || !profile) return true;

      try {
        return true;
      } catch (error) {
        console.error("Error during sign in:", error);
        return true;
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
