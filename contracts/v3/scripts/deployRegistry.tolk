tolk 1.5

import "@acton/io"
import "@acton/emulation/network"

import "@acton/emulation/scripts"

import "@wrappers/BagRegistry.gen"

fun main() {
    val deployer = scripts.wallet("piracy-deployer");
    val registry = BagRegistry.fromStorage({ version: 3 });
    println("Piracy v3 registry: {}", registry.address);
    if (scripts.isContractDeployed(registry.address)) {
        println("Already deployed, version {}", registry.getVersion());
        return;
    }
    registry.deploy(deployer.address, { value: grams("0.1") }).waitForFirstTransaction();
}
