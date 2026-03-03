# 🚀 DriveStack

An enterprise-grade, multi-tenant cloud storage platform designed with a focus on resource management, data integrity, and secure sharing. Built with the PERN stack (PostgreSQL, Express, React, Node.js) and Next.js.

**🌐 Live Demo**: [https://your-vercel-link.vercel.app](https://your-vercel-link.vercel.app)  
**🖥 Backend API**: [https://your-backend-link.onrender.com](https://your-backend-link.onrender.com)

_(Replace these links with your actual deployed Vercel and Render URLs once deployed)_

---

## 🌟 Key Features

### 1. 🛡️ Role-Based Secure Sharing

- **Description**: DriveStack enforces strict access controls. Instead of public, brute-forceable link sharing, users can securely grant file access directly to other registered users via their email addresses.
- **Architecture**: Implements an Access Control List (ACL) pattern via a `file_access` junction table. Only the file owner and explicitly whitelisted users (queried via Clerk API integration) can retrieve the Signed Download URLs.

### 2. 📊 Storage Resource Management (Quota System)

- **Description**: A robust system to prevent storage abuse and ensure fair allocation in a multi-tenant environment.
- **Architecture**: A `user_quotas` table tracks physical storage consumption in real-time. Upload endpoints intercept and assess `current_usage + new_file_size` against a strict 100MB limit. Deleting files triggers an automated recalculation, immediately releasing quota space. The frontend seamlessly presents this via a dynamic storage progress bar.

### 3. ⏱️ Non-Destructive File Versioning

- **Description**: Protects data integrity by preventing accidental overwrites. Uploading a file with an existing name creates a new snapshot rather than destroying the old one.
- **Architecture**: Incorporates a `file_versions` table. When duplicates are detected, a new version record is linked to the primary file ID, and the `storage_path` is rotated. Users can access a full timeline of their uploads and seamlessly restore the file state to any previous version.

### 4. ♻️ Complete Data Lifecycle (Soft Delete & Deep Clean)

- **Description**: Professional handling of file deletions with a two-step "Trash" system.
- **Architecture**:
  - **Soft Delete**: Files and folders are initially marked with a `deleted_at` timestamp. Global middleware and queries dynamically filter these out, effectively hiding them from the active vault while keeping the data perfectly intact for instant recovery.
  - **Hard Delete (Deep Clean)**: Permanent deletion doesn't just clear the active record. It executes a cascading deletion that physically purges all historical file versions from Supabase Object Storage, then cascades deletion across the database to prevent orphaned records and storage bloat.

### 5. ⚡ Real-Time Vault Search

- **Description**: Instantly find files and folders across thousands of documents.
- **Architecture**: Implements a debounced frontend search querying PostgreSQL `ILIKE` patterns. The database utilizes B-tree indexes on `name` columns to ensure rapid lookups, parsing results dynamically and categorizing them into Files and Folders.

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, TailwindCSS, Lucide Icons
- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL (Supabase)
- **Object Storage**: Supabase Storage Buckets
- **Authentication**: Clerk (JWT based auth with backend verification)

## 🏗️ System Architecture & Data Flow

1. **Authentication**: Client authenticates with Clerk -> Receives JWT -> Requests to API include Bearer token -> Express Middleware verifies JWT via Clerk Backend SDK.
2. **File Uploads**: Client sends `multipart/form-data` -> Express `multer` intercepts to memory buffer (10MB limit) -> Quota evaluated via PostgreSQL -> Streamed directly to Supabase Storage -> Metadata & Versioning saved to DB.
3. **Downloads**: Client requests file ID -> DB validates ownership or ACL `file_access` record -> Server authenticates with Supabase Service Role and generates a short-lived Signed URL -> URL returned to client to stream the binary directly.

## 🚦 Running Locally

1. **Clone & Install**

   ```bash
   git clone https://github.com/yourusername/drivestack.git
   cd drivestack
   cd server && npm install
   cd ../client && npm install
   ```

2. **Environment Variables**
   Create a `.env` in both `/server` and `/client`.
   - **Server**: Needs `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`
   - **Client**: Needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL` (http://localhost:5555/api)

3. **Database Setup**
   Run the schema sql contained in `server/db/schema.sql` inside your PostgreSQL database.

4. **Start Development Servers**
   - Backend: `npm run dev` (Runs on port 5555)
   - Frontend: `npm run dev -- --port 3200` (Runs on port 3200)

## 🎓 Why this project?

DriveStack was built to demonstrate proficiency beyond simple CRUD operations. It showcases the ability to think critically about edge cases, multi-tenant security boundaries, data lifecycle management, and resource optimization—the core responsibilities of a serious full-stack or backend engineer.
