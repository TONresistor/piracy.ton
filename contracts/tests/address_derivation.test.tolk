import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test registry derived address opens a live child`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0xAB, 2, ton("0.2"));

    val addr = registry.getBagAddress(0);
    expect(testing.isDeployed(addr)).toBeTrue();

    val child = BagItem.fromAddress(addr);
    val data = child.getBagData();
    expect(data.isInitialized).toBeTrue();
    expect(data.bagIndex).toEqual(0);
    expect(data.bagId).toEqual(0xAB);
}

get fun `test registry address matches independent derivation`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));

    val fromRegistry = registry.getBagAddress(0);
    val independent = bagItemAddressFor(0, registry.address);

    expect(fromRegistry).toEqual(independent);
}

get fun `test every child address is distinct and re-derivable`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 0, ton("0.2"));
    addBag(registry, uploader.address, 0x2, 1, ton("0.2"));
    addBag(registry, uploader.address, 0x3, 2, ton("0.2"));

    val a0 = registry.getBagAddress(0);
    val a1 = registry.getBagAddress(1);
    val a2 = registry.getBagAddress(2);

    expect(a0).toNotEqual(a1);
    expect(a1).toNotEqual(a2);
    expect(a0).toNotEqual(a2);

    expect(a0).toEqual(bagItemAddressFor(0, registry.address));
    expect(a1).toEqual(bagItemAddressFor(1, registry.address));
    expect(a2).toEqual(bagItemAddressFor(2, registry.address));
}

get fun `test embedded item code equals standalone build code`() {
    val (registry, _, _) = setupRegistry();
    expect(registry.getItemCode().hash()).toEqual(build("BagItem").hash());
}

get fun `test round trip address survives deactivation`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x99, 4, ton("0.2"));

    val addr = registry.getBagAddress(0);
    val child = BagItem.fromAddress(addr);
    child.sendDeactivateBag(uploader.address, { value: ton("0.1") });

    expect(registry.getBagAddress(0)).toEqual(addr);
    expect(child.isActive()).toBeFalse();
}
