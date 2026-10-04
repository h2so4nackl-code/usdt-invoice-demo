# Third-party notices

Our invoice/reconciliation/UI code is licensed under Apache-2.0. Standard license text is in LICENSE; publication is authorized by the project owner. No invented personal copyright identity or Tether/Circle affiliation or endorsement. This license does not transfer rights in third-party dependencies or public blockchain data.

Official Tether dependency: @tetherto/wdk-wallet-evm 1.0.0-beta.20, Apache-2.0, and its locked dependencies. WDK is imported as a dependency; no wallet/signing implementation is vendored or modified. ethers and other dependencies retain their installed upstream license/notice files. The installed name/version/license/install-script inventory is [dependencies.json](evidence/wdk/dependencies.json). Registry integrity is preserved in package-lock.json. Source archive excludes node_modules and native binaries; redistribution of installed dependencies/binaries requires their own notices review.

Our supplemental RPC validator, event reconciliation and dashboard are project code. Sepolia network metadata/Explorer are third-party public discovery sources. The Circle-published USDC test contract is not USDt or a Tether deployment. No upstream logos or remote font assets are bundled. No formal legal/security certification is implied.
