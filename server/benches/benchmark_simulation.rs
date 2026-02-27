use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Instant;

// Mock Room struct for benchmarking
#[derive(Clone)]
struct Room {
    id: String,
    count: usize,
}

fn main() {
    let num_rooms = 10_000;
    let target_id = format!("room-{}", num_rooms / 2); // Middle element

    println!("Benchmarking Room Removal (N = {})", num_rooms);

    // --- Vec<Room> Benchmark ---
    {
        let mut rooms: Vec<Room> = Vec::with_capacity(num_rooms);
        for i in 0..num_rooms {
            rooms.push(Room {
                id: format!("room-{}", i),
                count: 0,
            });
        }

        let start = Instant::now();
        if let Some(idx) = rooms.iter().position(|r| r.id == target_id) {
            rooms.remove(idx);
        }
        let duration = start.elapsed();
        println!("Vec<Room> removal time: {:?}", duration);
    }

    // --- HashMap<String, Room> Benchmark ---
    {
        let mut rooms: HashMap<String, Room> = HashMap::with_capacity(num_rooms);
        for i in 0..num_rooms {
            let id = format!("room-{}", i);
            rooms.insert(id.clone(), Room {
                id,
                count: 0,
            });
        }

        let start = Instant::now();
        rooms.remove(&target_id);
        let duration = start.elapsed();
        println!("HashMap<String, Room> removal time: {:?}", duration);
    }
}
