import { exec } from "child_process"
import { dirname } from "path"
import { coerce, gt, maxSatisfying, prerelease } from "semver"
import { TextDocument } from "vscode"

import { Cache } from "./Cache"
import { PackageInfo } from "./Document"
import { getCacheLifetime, hasMajorUpdateProtection } from "./Settings"
import { versionClear } from "./Utils"

const CACHE_PACKAGES: NPMViewResults = {}

// The `npm view` cache.
type NPMViewResults = Record<string, Cache<Promise<string[]>>>

// Get all package versions through `npm view` command.
export const getPackageVersions = async (name: string) => {
  // If the package query is in the cache (even in the process of being executed), return it.
  // This ensures that we will not have duplicate execution process while it is within lifetime.
  if (CACHE_PACKAGES[name]?.isValid(getCacheLifetime())) {
    return CACHE_PACKAGES[name].value
  }

  // Starts the `npm view` execution process.
  // The process is cached if it is triggered quickly, within lifetime.
  // @todo Make compatible with other package managers.
  const execPromise = new Promise<string[]>((resolve, reject) =>
    exec(`npm view --json ${name} versions`, (error, stdout) => {
      if (!error) {
        try {
          return resolve(JSON.parse(stdout))
        } catch (e) {
          /* empty */
        }
      }

      // In case of error or failure in processing the returned JSON,
      // we remove it from the cache and reject the Promise.
      delete CACHE_PACKAGES[name]

      return reject()
    })
  )

  CACHE_PACKAGES[name] = new Cache(execPromise)

  return execPromise
}

// Get latest package available, respecting the major update protection, if need.
export const getPackageLatestVersion = async (
  packageInfo: PackageInfo
): Promise<string | null> => {
  const packageVersions = await getPackageVersions(packageInfo.name)
  const versionClean = versionClear(packageInfo.version)
  const isPrerelease = prerelease(versionClean) !== null

  // We captured the largest version currently available.
  const versionLatest = maxSatisfying(packageVersions, ">=0", {
    includePrerelease: isPrerelease,
  })

  // If protection is not enabled, we will return the latest available version, even if there is a major bump.
  // Otherwise, we will try to respect the user-defined version limit.
  if (!hasMajorUpdateProtection()) {
    return versionLatest
  }

  // If we are dealing with a user-defined pre-release, we should check the latest compatible non-pre-release version available.
  // If this version is superior to the current pre-release version, we will suggest it first.
  if (isPrerelease) {
    const versionNonPrerelease = maxSatisfying(
      packageVersions,
      `^${coerce(versionClean)}`
    )

    if (versionNonPrerelease && gt(versionNonPrerelease, versionClean)) {
      return versionNonPrerelease
    }
  }

  const versionSatisfying = maxSatisfying(packageVersions, `^${versionClean}`, {
    includePrerelease: isPrerelease,
  })

  // If the user-defined version is exactly the same version available within the range given by the user,
  // we may suggest the latest version, which may include a major bump.
  // Eg. { "package": "^5.1.3" } and latest is also "5.1.3".
  if (!versionSatisfying || versionClean === versionSatisfying) {
    return versionLatest
  }

  // Otherwise, we will suggest the latest version within the user's range first.
  return versionSatisfying
}

interface NPMListResponse {
  dependencies?: {
    [packageName: string]: {
      version: string
    }
  }
}

let CACHE_PACKAGES_INSTALLED:
  | Cache<Promise<PackagesInstalled | undefined>>
  | undefined

export type PackagesInstalled = Record<string, string>

// Returns packages installed by the user and their respective versions.
export const getPackagesInstalled = (
  document: TextDocument
): Promise<PackagesInstalled | undefined> => {
  if (CACHE_PACKAGES_INSTALLED?.isValid(60 * 1000)) {
    return CACHE_PACKAGES_INSTALLED.value
  }

  const execPromise = new Promise<PackagesInstalled | undefined>((resolve) =>
    exec(
      `npm ls --json --depth=0`,
      { cwd: dirname(document.uri.fsPath) },
      (_error, stdout) => {
        if (stdout) {
          try {
            const execResult = JSON.parse(stdout) as NPMListResponse

            if (execResult.dependencies) {
              // The `npm ls` command returns a lot of information.
              // We only need the name of the installed package and its version.
              const packageEntries = Object.entries(
                execResult.dependencies
              ).map(([packageName, packageInfo]) => [
                packageName,
                packageInfo.version,
              ])

              return resolve(Object.fromEntries(packageEntries))
            }
          } catch (e) {
            /* empty */
          }
        }

        return resolve(undefined)
      }
    )
  )

  CACHE_PACKAGES_INSTALLED = new Cache(execPromise)

  return execPromise
}
