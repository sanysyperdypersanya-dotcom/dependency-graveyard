export type ManifestInfo = { ecosystem: string; format: string };

export function detectManifest(fileName: string): ManifestInfo | null {
  const file = fileName.toLowerCase().split(/[\\/]/).pop() ?? fileName.toLowerCase();
  if (file === "package.json" || file === "package-lock.json" || file === "npm-shrinkwrap.json") return { ecosystem: "npm", format: "npm manifest or lockfile" };
  if (file === "requirements.txt" || file.endsWith(".requirements") || file === "pyproject.toml" || file === "pipfile" || file === "pipfile.lock" || file === "poetry.lock") return { ecosystem: "PyPI", format: "Python dependency manifest" };
  if (file === "pom.xml" || file === "build.gradle" || file === "build.gradle.kts") return { ecosystem: "Maven", format: "Java dependency manifest" };
  if (file === "go.mod") return { ecosystem: "Go", format: "Go modules manifest" };
  if (file === "cargo.toml" || file === "cargo.lock") return { ecosystem: "Cargo", format: "Rust dependency manifest" };
  if (file === "composer.json" || file === "composer.lock") return { ecosystem: "Packagist", format: "Composer manifest or lockfile" };
  if (file === "gemfile" || file === "gemfile.lock") return { ecosystem: "RubyGems", format: "Bundler manifest or lockfile" };
  if (file.endsWith(".csproj") || file === "packages.config") return { ecosystem: "NuGet", format: ".NET dependency manifest" };
  if (file === "vcpkg.json") return { ecosystem: "vcpkg", format: "C/C++ vcpkg manifest" };
  if (file === "conanfile.txt") return { ecosystem: "Conan", format: "C/C++ Conan manifest" };
  return null;
}
export type ScannedDependency = { name: string; version: string; ecosystem: string };
export const supportedManifests = "package.json / npm lock, requirements.txt, pyproject.toml / Pipfile, pom.xml / Gradle, go.mod, Cargo.toml / Cargo.lock, composer.json / lock, Gemfile / lock, .csproj / packages.config, vcpkg.json, conanfile.txt";

function cleanVersion(value: string | undefined): string {
  return (value ?? "—").replace(/^[\s~^=><v]+/, "").replace(/["',;\s]+$/, "") || "—";
}

function parseRequirement(line: string, ecosystem: string): ScannedDependency | null {
  const clean = line.replace(/\s+#.*$/, "").trim();
  if (!clean || clean.startsWith("#") || clean.startsWith("-") || clean.startsWith("[")) return null;
  const match = clean.match(/^([A-Za-z0-9_.:/@+-]+)(?:\[[^\]]+\])?\s*(.*)$/);
  if (!match) return null;
  const versionMatch = match[2].match(/(?:===|==|~=|>=|<=|!=|>|<)\s*([^,;\s]+)/);
  return { name: match[1], version: cleanVersion(versionMatch?.[1]), ecosystem };
}

function xmlValue(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp("<(?:[\\w.-]+:)?" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?" + tag + "\\s*>", "i"));
  return match?.[1].replace(/<[^>]*>/g, "").trim()
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function xmlAttribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return attributes.match(new RegExp("\\b" + escapedName + "\\s*=\\s*([\"'])(.*?)\\1", "i"))?.[2];
}

function parsePom(content: string): ScannedDependency[] {
  const blocks = content.match(/<(?:[\w.-]+:)?dependency\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?dependency\s*>/gi) ?? [];
  return blocks.flatMap((block) => {
    const group = xmlValue(block, "groupId");
    const artifact = xmlValue(block, "artifactId");
    return group && artifact ? [{ name: group + ":" + artifact, version: cleanVersion(xmlValue(block, "version")), ecosystem: "Maven" }] : [];
  });
}

function parseDotnet(file: string, content: string): ScannedDependency[] {
  if (file === "packages.config") {
    const packages = content.match(/<(?:[\w.-]+:)?package\b[^>]*\/?\s*>/gi) ?? [];
    return packages.flatMap((tag) => {
      const name = xmlAttribute(tag, "id");
      return name ? [{ name, version: cleanVersion(xmlAttribute(tag, "version")), ecosystem: "NuGet" }] : [];
    });
  }

  const references = content.match(/<(?:[\w.-]+:)?PackageReference\b[^>]*(?:\/>|>[\s\S]*?<\/(?:[\w.-]+:)?PackageReference\s*>)/gi) ?? [];
  return references.flatMap((reference) => {
    const opening = reference.match(/^<[^>]+>/)?.[0] ?? reference;
    const name = xmlAttribute(opening, "Include") ?? xmlAttribute(opening, "Update");
    const version = xmlAttribute(opening, "Version") ?? xmlValue(reference, "Version");
    return name ? [{ name, version: cleanVersion(version), ecosystem: "NuGet" }] : [];
  });
}

export function parseManifest(fileName: string, content: string): ScannedDependency[] {
  const file = fileName.toLowerCase().split(/[\\/]/).pop() ?? fileName.toLowerCase();
  if (["package.json", "package-lock.json", "npm-shrinkwrap.json", "composer.json", "composer.lock", "pipfile.lock", "vcpkg.json"].includes(file)) {
    const json = JSON.parse(content) as Record<string, unknown>;
    const ecosystem = file.startsWith("package") || file === "npm-shrinkwrap.json" ? "npm" : file.startsWith("composer") ? "Packagist" : file === "pipfile.lock" ? "PyPI" : "vcpkg";
    if (file === "vcpkg.json") {
      const deps = Array.isArray(json.dependencies) ? json.dependencies : [];
      return deps.flatMap((dep) => {
        const name = typeof dep === "string" ? dep : typeof dep === "object" && dep !== null && "name" in dep ? String(dep.name) : "";
        return name ? [{ name, version: "—", ecosystem }] : [];
      });
    }
    if (file === "package-lock.json" || file === "npm-shrinkwrap.json") {
      const fromPackages = Object.entries((json.packages ?? {}) as Record<string, { version?: string }>).flatMap(([path, pkg]) => {
        const marker = "node_modules/";
        const index = path.lastIndexOf(marker);
        if (index < 0) return [];
        return [{ name: path.slice(index + marker.length), version: cleanVersion(pkg.version), ecosystem }];
      });
      if (fromPackages.length) return fromPackages;
      const nested: ScannedDependency[] = [];
      const visit = (deps: unknown) => {
        if (!deps || typeof deps !== "object") return;
        for (const [name, raw] of Object.entries(deps as Record<string, unknown>)) {
          if (!raw || typeof raw !== "object") continue;
          const entry = raw as { version?: string; dependencies?: unknown };
          nested.push({ name, version: cleanVersion(entry.version), ecosystem });
          visit(entry.dependencies);
        }
      };
      visit(json.dependencies);
      return nested;
    }
    if (file === "composer.lock") {
      const lockPackages = [...(Array.isArray(json.packages) ? json.packages : []), ...(Array.isArray(json["packages-dev"]) ? json["packages-dev"] as unknown[] : [])] as Array<{ name?: string; version?: string }>;
      return lockPackages.flatMap((pkg) => pkg.name ? [{ name: pkg.name, version: cleanVersion(pkg.version), ecosystem }] : []);
    }
    if (file === "pipfile.lock") {
      return ["default", "develop"].flatMap((section) => Object.entries((json[section] ?? {}) as Record<string, { version?: string }>).map(([name, entry]) => ({ name, version: cleanVersion(entry.version), ecosystem })));
    }
    const sections = file === "package.json" ? ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] : ["require", "require-dev"];
    return sections.flatMap((section) => {
      const deps = json[section];
      if (!deps || typeof deps !== "object") return [];
      return Object.entries(deps as Record<string, unknown>).map(([name, version]) => ({ name, version: cleanVersion(typeof version === "string" ? version : undefined), ecosystem }));
    });
  }

  if (file === "requirements.txt" || file.endsWith(".requirements")) {
    return content.split(/\r?\n/).flatMap((line) => {
      const dep = parseRequirement(line, "PyPI");
      return dep ? [dep] : [];
    });
  }

  if (file === "pyproject.toml" || file === "pipfile") {
    const result: ScannedDependency[] = [];
    let section = "";
    let inProjectDependencies = false;
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      const sectionMatch = line.match(/^\[([^\]]+)\]/);
      if (sectionMatch) { section = sectionMatch[1].toLowerCase(); continue; }
      if (/^dependencies\s*=\s*\[/.test(line) && section === "project") { inProjectDependencies = true; continue; }
      if (inProjectDependencies && line.startsWith("]")) { inProjectDependencies = false; continue; }
      if ((section.includes("dependencies") || inProjectDependencies) && (line.startsWith("-") || line.startsWith("\""))) {
        const requirement = line.replace(/^-\s*/, "").replace(/^['"]|['"],?$/g, "");
        const dep = parseRequirement(requirement, "PyPI");
        if (dep) result.push(dep);
      } else if (section === "tool.poetry.dependencies" || (file === "pipfile" && (section === "packages" || section === "dev-packages"))) {
        const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
        if (match && match[1].toLowerCase() !== "python") {
          const version = match[2].match(/["']([^"']+)["']/)?.[1] ?? match[2].match(/version\s*=\s*["']([^"']+)["']/)?.[1];
          result.push({ name: match[1], version: cleanVersion(version), ecosystem: "PyPI" });
        }
      }
    }
    return result;
  }

  if (file === "poetry.lock" || file === "cargo.lock") {
    const ecosystem = file === "poetry.lock" ? "PyPI" : "Cargo";
    const packages: ScannedDependency[] = [];
    let name = "";
    let version = "—";
    const save = () => { if (name) packages.push({ name, version, ecosystem }); };
    for (const line of content.split(/\r?\n/)) {
      const section = line.match(/^\[\[package\]\]/);
      if (section) { save(); name = ""; version = "—"; continue; }
      const nameMatch = line.match(/^name\s*=\s*["']([^"']+)["']/);
      const versionMatch = line.match(/^version\s*=\s*["']([^"']+)["']/);
      if (nameMatch) name = nameMatch[1];
      if (versionMatch) version = cleanVersion(versionMatch[1]);
    }
    save();
    return packages;
  }

  if (file === "pom.xml") return parsePom(content);

  if (file === "build.gradle" || file === "build.gradle.kts") {
    const result: ScannedDependency[] = [];
    const pattern = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly)\s*(?:\(\s*)?["']([^:"']+):([^:"']+):([^"']+)["']/g;
    for (const match of content.matchAll(pattern)) result.push({ name: `${match[1]}:${match[2]}`, version: cleanVersion(match[3]), ecosystem: "Maven" });
    return result;
  }

  if (file === "go.mod") {
    return content.split(/\r?\n/).flatMap((line) => {
      const clean = line.replace(/\/\/.*$/, "").trim();
      const match = clean.match(/^([A-Za-z0-9._~+/-]+)\s+(v[\w.+-]+)(?:\s|$)/);
      return match ? [{ name: match[1], version: cleanVersion(match[2]), ecosystem: "Go" }] : [];
    });
  }

  if (file === "cargo.toml") {
    const result: ScannedDependency[] = [];
    let inDependencies = false;
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, "").trim();
      const section = line.match(/^\[([^\]]+)\]/);
      if (section) { inDependencies = /(^|\.)(dev-|build-)?dependencies(?:\.|$)/.test(section[1]); continue; }
      if (!inDependencies) continue;
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
      if (!match) continue;
      const packageName = match[2].match(/package\s*=\s*["']([^"']+)["']/)?.[1] ?? match[1];
      const version = match[2].match(/^["']([^"']+)["']/)?.[1] ?? match[2].match(/version\s*=\s*["']([^"']+)["']/)?.[1];
      result.push({ name: packageName, version: cleanVersion(version), ecosystem: "Cargo" });
    }
    return result;
  }

  if (file === "gemfile") {
    return content.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*gem\s+["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/);
      return match ? [{ name: match[1], version: cleanVersion(match[2]), ecosystem: "RubyGems" }] : [];
    });
  }

  if (file === "gemfile.lock") {
    return content.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s{4}([A-Za-z0-9_.-]+)\s+\(([^)]+)\)/);
      return match ? [{ name: match[1], version: cleanVersion(match[2]), ecosystem: "RubyGems" }] : [];
    });
  }

  if (file.endsWith(".csproj") || file === "packages.config") return parseDotnet(file, content);

  if (file === "conanfile.txt") {
    let inRequires = false;
    return content.split(/\r?\n/).flatMap((rawLine) => {
      const line = rawLine.trim();
      const section = line.match(/^\[([^\]]+)\]/);
      if (section) { inRequires = section[1].toLowerCase() === "requires"; return []; }
      if (!inRequires || !line || line.startsWith("#")) return [];
      const [name, version] = line.split(/\s*\//, 2);
      return [{ name, version: cleanVersion(version), ecosystem: "Conan" }];
    });
  }

  return [];
}

