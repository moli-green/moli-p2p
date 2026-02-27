# Performance Optimization: Server Linear Room Removal

## Context
The server currently stores active rooms in a `Vec<Room>`. When a room becomes empty, the `cleanup` function iterates through this vector to find and remove the room by ID. This is an O(N) operation. As the number of concurrent rooms grows, this could become a bottleneck.

## Benchmark Results
A benchmark simulation with 10,000 rooms showed a significant performance improvement when using `HashMap` for removal:

- **Current (`Vec<Room>`) Removal Time**: ~255µs
- **Proposed (`HashMap<String, Room>`) Removal Time**: ~1.4µs
- **Improvement**: ~180x faster

## Instructions for Antigravity

Please refactor `server/src/main.rs` to use a `HashMap` for storing rooms instead of a `Vec`.

### 1. Update `AppState` Struct
Change the `rooms` field type:
```rust
// Old
rooms: Arc<TokioRwLock<Vec<Room>>>,

// New
rooms: Arc<TokioRwLock<HashMap<String, Room>>>,
```

### 2. Refactor `ws_handler` / `handle_socket` (Room Assignment)
Update the logic where a user is assigned to a room.
- Instead of `rooms.push(...)`, use `rooms.insert(new_id, ...)`.
- When searching for an available room (capacity < 100), iterate over `rooms.values()` instead of `rooms.iter()`. The logic remains similar (linear scan to find *any* available room is acceptable for now, as the primary goal is optimizing removal).

### 3. Refactor `cleanup` Function
Update the room removal logic to use O(1) lookup.
- Instead of:
  ```rust
  if let Some(idx) = rooms.iter().position(|r| r.id == *room_id) {
      // check count and remove(idx)
  }
  ```
- Use:
  ```rust
  if let Some(room) = rooms.get(room_id) {
      if room.count.load(Ordering::Relaxed) == 0 {
          println!("Room {} is empty. Removing.", room_id);
          rooms.remove(room_id);
      }
  }
  ```
  *(Note: You might need to handle the borrow checker carefully here. `rooms.get` borrows immutable, `rooms.remove` borrows mutable. You might need to check existence first or just use `entry` API if appropriate, or simply: `if rooms.get(room_id).map(|r| r.count.load(Ordering::Relaxed) == 0).unwrap_or(false) { rooms.remove(room_id); }`)*

### 4. Verification
Ensure the code compiles and passes existing tests (if any). The logic should remain functionally identical to the user.
