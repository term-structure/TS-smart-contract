import { execSync } from "child_process";
import { promises as fs, constants } from "fs";

export function getCurrentBranch(): string {
  try {
    const branchName = execSync("git rev-parse --abbrev-ref HEAD")
      .toString()
      .trim();
    return branchName;
  } catch (error) {
    console.error("Error fetching branch:", error);
    return "";
  }
}

export function getLatestCommit(): string {
  try {
    // Execute git command to get the latest commit hash
    const commitHash = execSync("git rev-parse HEAD").toString().trim();
    return commitHash;
  } catch (error) {
    console.error("Error fetching commit:", error);
    return "";
  }
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    await fs.access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function createDirectoryIfNotExists(path: string): Promise<void> {
  const exists = await directoryExists(path);
  if (!exists) {
    await fs.mkdir(path, { recursive: true });
    console.log(`Directory created at: ${path}`);
  } else {
    console.log(`Directory already exists at: ${path}`);
  }
}
