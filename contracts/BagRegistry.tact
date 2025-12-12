import "@stdlib/deploy";
import "@stdlib/ownable";

// Bag entry stored in the registry
struct BagEntry {
    bag_id: Int as uint256;
    name: String;
    category: Int as uint8;
    uploader: Address;
    timestamp: Int as uint64;
    active: Bool;
}

// Message to add a new bag (requires 0.1 TON payment)
message AddBag {
    bag_id: Int as uint256;
    name: String;
    category: Int as uint8;
}

// Message to delete a bag (owner only)
message DeleteBag {
    index: Int as uint64;
}

// Message to withdraw funds (owner only)
message Withdraw {
    amount: Int as coins;
}

contract BagRegistry with Deployable, Ownable {
    owner: Address;
    total_bags: Int as uint64;
    bags: map<Int, BagEntry>;
    bag_exists: map<Int, Bool>;

    const REGISTRATION_FEE: Int = ton("0.1");
    const MIN_STORAGE: Int = ton("0.01");

    init(owner: Address) {
        self.owner = owner;
        self.total_bags = 0;
    }

    // Add a new bag - requires 0.1 TON payment
    receive(msg: AddBag) {
        let ctx: Context = context();

        // Check payment
        require(ctx.value >= self.REGISTRATION_FEE, "Payment of 0.1 TON required");

        // Check bag_id is valid
        require(msg.bag_id != 0, "Invalid bag_id");

        // Check not duplicate
        require(self.bag_exists.get(msg.bag_id) != true, "Bag already exists");

        // Check name not empty
        require(msg.name.asSlice().bits() > 0, "Name required");

        // Check category valid (0-5: video, audio, apps, games, books, other)
        require(msg.category <= 5, "Invalid category");

        // Create entry
        let entry: BagEntry = BagEntry{
            bag_id: msg.bag_id,
            name: msg.name,
            category: msg.category,
            uploader: ctx.sender,
            timestamp: now(),
            active: true
        };

        // Store
        let index: Int = self.total_bags;
        self.bags.set(index, entry);
        self.bag_exists.set(msg.bag_id, true);
        self.total_bags = self.total_bags + 1;
    }

    // Delete a bag (owner only) - soft delete, marks as inactive
    receive(msg: DeleteBag) {
        self.requireOwner();

        let entry: BagEntry? = self.bags.get(msg.index);
        require(entry != null, "Bag not found");

        let bag: BagEntry = entry!!;
        bag.active = false;
        self.bags.set(msg.index, bag);
    }

    // Withdraw accumulated fees (owner only)
    receive(msg: Withdraw) {
        self.requireOwner();

        let available: Int = myBalance() - self.MIN_STORAGE;
        require(msg.amount <= available, "Insufficient balance");

        send(SendParameters{
            to: self.owner,
            value: msg.amount,
            mode: SendIgnoreErrors,
            body: "Withdrawal".asComment()
        });
    }

    // Get single bag by index
    get fun get_bag(index: Int): BagEntry? {
        return self.bags.get(index);
    }

    // Get total number of bags
    get fun get_total(): Int {
        return self.total_bags;
    }

    // Check if bag_id already exists
    get fun bag_exists(bag_id: Int): Bool {
        return self.bag_exists.get(bag_id) == true;
    }

    // Get registration fee
    get fun get_fee(): Int {
        return self.REGISTRATION_FEE;
    }

    // Get contract balance
    get fun get_balance(): Int {
        return myBalance();
    }
}
