/**
 * Ad-hoc sign the bundle, properly.
 *
 * electron-builder's `identity: null` means "do not sign", and the result is
 * NOT an unsigned app — it is a broken one. The Electron executable keeps its
 * own linker signature (Identifier=Electron) while the bundle's resources are
 * never sealed, so `spctl` reports:
 *
 *   code has no resources but signature indicates they must be present
 *
 * An app that FAILS verification is worse than one that honestly has no
 * Developer ID: it is the state that produces "the application is damaged"
 * rather than the ordinary "unidentified developer" prompt, and it makes any
 * later signing problem impossible to distinguish from this one.
 *
 * So the bundle is ad-hoc signed here. It still cannot be notarised — that
 * needs a Developer ID, which needs a paid Apple Developer account — but it is
 * now internally consistent: the right identifier, sealed resources, and
 * `codesign --verify --deep --strict` passes. Anyone who clones this repo gets
 * the same result without needing a certificate.
 *
 * `--deep` is deprecated for real signing (Apple wants nested code signed
 * inside-out) and is the pragmatic choice for an ad-hoc seal over a framework
 * we did not build. Swap this for a Developer ID identity in electron-builder.yml
 * when there is one, and delete the hook.
 */

const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  // Verify rather than assume. A signature that does not verify is the exact
  // failure this hook exists to prevent, and it is silent until a user sees it.
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  console.log(`  • ad-hoc signed and verified  file=${path.basename(app)}`);
};
