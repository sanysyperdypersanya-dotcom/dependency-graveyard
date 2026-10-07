import assert from "node:assert/strict";
import test from "node:test";
import { detectManifest, parseManifest } from "../src/parsers.ts";

const only = (fileName, source) => parseManifest(fileName, source);

test("detects supported manifests and reports unknown file types", () => {
  assert.equal(detectManifest("project/package.json")?.ecosystem, "npm");
  assert.equal(detectManifest("MyApp.csproj")?.ecosystem, "NuGet");
  assert.equal(detectManifest("notes.md"), null);
});

test("reads package.json dependency sections", () => {
  assert.deepEqual(only("package.json", JSON.stringify({ dependencies: { moment: "^2.24.0" }, devDependencies: { vitest: "~2.0.0" } })), [
    { name: "moment", version: "2.24.0", ecosystem: "npm" },
    { name: "vitest", version: "2.0.0", ecosystem: "npm" },
  ]);
});

test("reads npm lockfiles and scoped package names", () => {
  assert.deepEqual(only("package-lock.json", JSON.stringify({ packages: { "": {}, "node_modules/@scope/pkg": { version: "1.2.3" } } })), [
    { name: "@scope/pkg", version: "1.2.3", ecosystem: "npm" },
  ]);
});

test("reads requirements.txt and skips pip options", () => {
  assert.deepEqual(only("requirements.txt", "# comment\nnose==1.3.7\nrequests>=2.1\n-r base.txt"), [
    { name: "nose", version: "1.3.7", ecosystem: "PyPI" },
    { name: "requests", version: "2.1", ecosystem: "PyPI" },
  ]);
});

test("reads PEP 621 and Poetry dependency sections", () => {
  assert.deepEqual(only("pyproject.toml", `[project]\ndependencies = [\n  "nose>=1.3",\n]\n\n[tool.poetry.dependencies]\npython = "^3.11"\npytest = "^8.0"`), [
    { name: "nose", version: "1.3", ecosystem: "PyPI" },
    { name: "pytest", version: "8.0", ecosystem: "PyPI" },
  ]);
});

test("reads Pipfile and Pipfile.lock", () => {
  assert.deepEqual(only("Pipfile", `[packages]\nnose = "==1.3.7"`), [{ name: "nose", version: "1.3.7", ecosystem: "PyPI" }]);
  assert.deepEqual(only("Pipfile.lock", JSON.stringify({ default: { nose: { version: "==1.3.7" } } })), [{ name: "nose", version: "1.3.7", ecosystem: "PyPI" }]);
});

test("reads Poetry lockfile", () => {
  assert.deepEqual(only("poetry.lock", `[[package]]\nname = "nose"\nversion = "1.3.7"`), [{ name: "nose", version: "1.3.7", ecosystem: "PyPI" }]);
});

test("reads Maven POM and Gradle coordinates", () => {
  assert.deepEqual(only("pom.xml", `<project><dependencies><dependency><groupId>log4j</groupId><artifactId>log4j</artifactId><version>1.2.17</version></dependency></dependencies></project>`), [
    { name: "log4j:log4j", version: "1.2.17", ecosystem: "Maven" },
  ]);
  assert.deepEqual(only("build.gradle.kts", `dependencies { implementation("log4j:log4j:1.2.17") }`), [
    { name: "log4j:log4j", version: "1.2.17", ecosystem: "Maven" },
  ]);
});

test("reads Go modules", () => {
  assert.deepEqual(only("go.mod", `module example.com/app\nrequire (\n github.com/dgrijalva/jwt-go v3.2.0+incompatible\n)`), [
    { name: "github.com/dgrijalva/jwt-go", version: "3.2.0+incompatible", ecosystem: "Go" },
  ]);
});

test("reads Cargo manifests and lockfiles", () => {
  assert.deepEqual(only("Cargo.toml", `[dependencies]\nfailure = "0.1.8"\nserde = { version = "1.0", features = ["derive"] }`), [
    { name: "failure", version: "0.1.8", ecosystem: "Cargo" },
    { name: "serde", version: "1.0", ecosystem: "Cargo" },
  ]);
  assert.deepEqual(only("Cargo.lock", `[[package]]\nname = "failure"\nversion = "0.1.8"`), [{ name: "failure", version: "0.1.8", ecosystem: "Cargo" }]);
});

test("reads Composer manifests and lockfiles", () => {
  assert.deepEqual(only("composer.json", JSON.stringify({ require: { "swiftmailer/swiftmailer": "^6.3" } })), [
    { name: "swiftmailer/swiftmailer", version: "6.3", ecosystem: "Packagist" },
  ]);
  assert.deepEqual(only("composer.lock", JSON.stringify({ packages: [{ name: "swiftmailer/swiftmailer", version: "v6.3.0" }] })), [
    { name: "swiftmailer/swiftmailer", version: "6.3.0", ecosystem: "Packagist" },
  ]);
});

test("reads Ruby Gemfiles and lockfiles", () => {
  assert.deepEqual(only("Gemfile", `gem "therubyracer", "~> 0.12.3"`), [{ name: "therubyracer", version: "0.12.3", ecosystem: "RubyGems" }]);
  assert.deepEqual(only("Gemfile.lock", `    therubyracer (0.12.3)`), [{ name: "therubyracer", version: "0.12.3", ecosystem: "RubyGems" }]);
});

test("reads .NET project and packages.config files", () => {
  assert.deepEqual(only("App.csproj", `<Project><ItemGroup><PackageReference Include="System.Data.SqlClient" Version="4.8.6" /></ItemGroup></Project>`), [
    { name: "System.Data.SqlClient", version: "4.8.6", ecosystem: "NuGet" },
  ]);
  assert.deepEqual(only("packages.config", `<packages><package id="System.Data.SqlClient" version="4.8.6" /></packages>`), [
    { name: "System.Data.SqlClient", version: "4.8.6", ecosystem: "NuGet" },
  ]);
});

test("reads vcpkg and Conan dependency lists", () => {
  assert.deepEqual(only("vcpkg.json", JSON.stringify({ dependencies: ["cpprestsdk", { name: "fmt" }] })), [
    { name: "cpprestsdk", version: "—", ecosystem: "vcpkg" },
    { name: "fmt", version: "—", ecosystem: "vcpkg" },
  ]);
  assert.deepEqual(only("conanfile.txt", `[requires]\ncpprestsdk/2.10.18`), [{ name: "cpprestsdk", version: "2.10.18", ecosystem: "Conan" }]);
});

test("invalid JSON is reported as a parse error", () => {
  assert.throws(() => only("package.json", "{broken"));
});
