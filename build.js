const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load .env file if it exists
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const buildDir = process.env.BUILD_DIR || "dist";
console.log(`🏗️  Building project to: ${buildDir}\n`);

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

async function build() {
  try {
    // Get tsconfig.json absolute path
    const tsconfigPath = fs.existsSync("tsconfig.json")
      ? path.resolve("tsconfig.json")
      : path.resolve(process.cwd(), "../tsconfig.json");

    const tsconfigDir = path.dirname(tsconfigPath);
    const resolvedOutDir = path.resolve(tsconfigDir, buildDir);

    console.log(`🧭 Using tsconfig from: ${tsconfigPath}`);
    console.log(`📂 Resolved build output directory: ${resolvedOutDir}\n`);

    // Step 1: Clean build directory
    if (fs.existsSync(resolvedOutDir)) {
      console.log("🧹 Cleaning build directory...");
      fs.rmSync(resolvedOutDir, { recursive: true, force: true });
      console.log(`✅ Cleaned ${resolvedOutDir}\n`);
    }

    // Step 2: Update tsconfig.json outDir dynamically
    if (fs.existsSync(tsconfigPath)) {
      console.log("📝 Updating tsconfig.json outDir...");
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      tsconfig.compilerOptions = tsconfig.compilerOptions || {};
      tsconfig.compilerOptions.outDir = resolvedOutDir;
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
      console.log(`✅ tsconfig.json updated to use outDir: ${resolvedOutDir}\n`);
    }

    // Step 3: Compile TypeScript
    console.log("📦 Compiling TypeScript...");
    execSync("tsc", {
      stdio: "inherit",
      encoding: "utf-8",
      env: { ...process.env, BUILD_DIR: resolvedOutDir },
    });
    console.log(`✅ TypeScript compilation completed!\n`);

    if (!fs.existsSync(resolvedOutDir)) {
      throw new Error(`Build directory ${resolvedOutDir} was not created`);
    }

    // Step 4: Copy templates
    console.log("📧 Copying email templates...");
    const templatesSource = path.join(process.cwd(), "src", "templates");
    const templatesDestination = path.join(resolvedOutDir, "templates");

    if (fs.existsSync(templatesSource)) {
      copyDir(templatesSource, templatesDestination);

      const emailTemplatesPath = path.join(templatesDestination, "emailTemplates");
      if (fs.existsSync(emailTemplatesPath)) {
        const templateFiles = fs.readdirSync(emailTemplatesPath);
        console.log(`✅ Email templates copied: ${templateFiles.length} files\n`);
      } else {
        console.warn("⚠️  No 'emailTemplates' folder found inside templates.\n");
      }
    } else {
      console.warn(`⚠️  Templates directory not found at: ${templatesSource}\n`);
    }

    // Step 5: Copy static assets
    console.log("📄 Copying static assets...");
    const staticAssets = [
      { src: "banks.json", dest: "banks.json" },
      { src: "nigeria-states-lgas.json", dest: "nigeria-states-lgas.json" },
    ];

    for (const asset of staticAssets) {
      const srcPath = path.join(process.cwd(), asset.src);
      const destPath = path.join(resolvedOutDir, asset.dest);

      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✓ Copied ${asset.src}`);
      } else {
        console.warn(`  ⚠️  Missing static asset: ${asset.src}`);
      }
    }

    // Step 6: Summary
    console.log(`\n✅ Build completed successfully! Files written to: ${resolvedOutDir}\n`);
  } catch (err) {
    console.error("❌ Build failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

build();
