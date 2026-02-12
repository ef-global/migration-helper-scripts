import packageJson from "../package.json";

type PackageJsonShape = {
  version?: string;
};

export const VERSION =
  ((packageJson as PackageJsonShape).version ?? "").trim() || "0.0.0";
