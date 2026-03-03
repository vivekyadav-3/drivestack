import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only protect the dashboard and internal API routes
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/api/folders(.*)', '/api/files(.*)']);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Optimized matcher to skip all static assets and only run on relevant routes
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
