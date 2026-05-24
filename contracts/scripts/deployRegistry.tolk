import "@acton/io"

import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@wrappers/BagRegistry.gen"

const REGISTRY_DEPLOY_VALUE: coins = ton("0.1")

fun main() {
    val deployer = scripts.wallet("deployer");

    val registry = BagRegistry.fromStorage({ nextBagIndex: 0 });

    println("====================================================");
    println("Deploy BagRegistry (piracy.ton — owner-less master)");
    println("====================================================");
    println("Deployer wallet : {}", deployer.address);
    println("Registry address: {}", registry.address);
    println("Deploy value    : {:ton}", REGISTRY_DEPLOY_VALUE);
    println("");

    if (scripts.isContractDeployed(registry.address)) {
        println("Registry already deployed at this address — nothing to do.");
        println("Total bags: {}", registry.getTotal());
        return;
    }

    println("Broadcasting deploy (no-op locally without --net)...");
    val result = registry.deploy(
        deployer.address,
        { value: REGISTRY_DEPLOY_VALUE, bounce: false },
    );
    result.waitForFirstTransaction();

    println("");
    println("BagRegistry deployed.");
    println("Address    : {}", registry.address);
    println("Total bags : {}", registry.getTotal());
}
