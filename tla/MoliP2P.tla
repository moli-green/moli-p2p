----------------------------- MODULE MoliP2P -----------------------------
EXTENDS Integers, FiniteSets, Sequences, TLC

(***************************************************************************)
(* Moli P2P Protocol - Formal Specification (TLA+)                         *)
(*                                                                         *)
(* This model abstracts the entire architecture of the Moli P2P system     *)
(* (Signaling, WebRTC Mesh connection, and Data Gossip with Sovereign      *)
(* Safety). It is specifically bounded to prevent the state space          *)
(* explosion that occurred in previous AI sessions.                        *)
(***************************************************************************)

CONSTANTS
    Peers,          \* Set of all possible peers, e.g., {"p1", "p2", "p3"}
    Images,         \* Set of all possible image hashes, e.g., {"imgA", "imgB"}
    MaxConnections, \* Maximum number of signaling connections allowed (e.g., 10)
    MaxMessages     \* Maximum number of messages in flight to prevent infinite queues

VARIABLES
    (* Signaling Server State *)
    server_connected,   \* Set of peers currently connected to the signaling server

    (* Network / Mesh State *)
    mesh_links,         \* Set of established P2P connections: subsets of size 2, e.g., {{"p1", "p2"}}

    (* Client State *)
    peer_store,         \* Function mapping peer -> set of images they hold
    peer_status,        \* Function mapping peer -> {"Offline", "Signaling", "Connected"}

    (* In-flight Data (Gossip Protocol) *)
    network_messages,   \* Set of messages currently in transit between peers
    message_count       \* Integer to hard-bound the total messages generated (prevent infinite loops)

vars == <<server_connected, mesh_links, peer_store, peer_status, network_messages, message_count>>

(***************************************************************************)
(* Type Invariant                                                          *)
(***************************************************************************)
TypeOK ==
    /\ server_connected \subseteq Peers
    /\ mesh_links \subseteq { s \in SUBSET Peers : Cardinality(s) = 2 }
    /\ peer_store \in [ Peers -> SUBSET Images ]
    /\ peer_status \in [ Peers -> {"Offline", "Signaling", "Connected"} ]
    /\ network_messages \subseteq [ src: Peers, dst: Peers, img: Images ]
    /\ message_count \in 0..MaxMessages

(***************************************************************************)
(* Initial State                                                           *)
(***************************************************************************)
Init ==
    /\ server_connected = {}
    /\ mesh_links = {}
    /\ peer_store = [ p \in Peers |-> {} ]
    /\ peer_status = [ p \in Peers |-> "Offline" ]
    /\ network_messages = {}
    /\ message_count = 0

(***************************************************************************)
(* State Transitions (Actions)                                             *)
(***************************************************************************)

(* 1. A peer joins the signaling server *)
JoinSignaling(p) ==
    /\ peer_status[p] = "Offline"
    /\ Cardinality(server_connected) < MaxConnections \* Strict DoS limit check
    /\ server_connected' = server_connected \cup {p}
    /\ peer_status' = [peer_status EXCEPT ![p] = "Signaling"]
    /\ UNCHANGED <<mesh_links, peer_store, network_messages, message_count>>

(* 2. Two signaling peers discover each other and form a WebRTC P2P link *)
EstablishWebRTC(p1, p2) ==
    /\ p1 /= p2
    /\ peer_status[p1] \in {"Signaling", "Connected"}
    /\ peer_status[p2] \in {"Signaling", "Connected"}
    /\ p1 \in server_connected
    /\ p2 \in server_connected
    /\ {p1, p2} \notin mesh_links
    /\ mesh_links' = mesh_links \cup {{p1, p2}}
    /\ peer_status' = [peer_status EXCEPT ![p1] = "Connected", ![p2] = "Connected"]
    /\ UNCHANGED <<server_connected, peer_store, network_messages, message_count>>

(* 3. A connected peer generates/uploads a local image and initiates a broadcast *)
UploadAndBroadcast(p, img) ==
    /\ peer_status[p] = "Connected"
    /\ img \notin peer_store[p]
    /\ message_count + Cardinality({ n \in Peers : {p, n} \in mesh_links }) <= MaxMessages
    /\ peer_store' = [peer_store EXCEPT ![p] = @ \cup {img}]
    /\ LET new_msgs == { [src |-> p, dst |-> n, img |-> img] : n \in {x \in Peers : {p, x} \in mesh_links} } IN
       /\ network_messages' = network_messages \cup new_msgs
       /\ message_count' = message_count + Cardinality(new_msgs)
    /\ UNCHANGED <<server_connected, mesh_links, peer_status>>

(* 4. A peer receives a relayed image, stores it (Sovereign Safety), and gossips to neighbors *)
ReceiveAndRelay(msg) ==
    /\ msg \in network_messages
    /\ msg.img \notin peer_store[msg.dst] \* Deduplication: only process if new
    /\ peer_status[msg.dst] = "Connected"
    /\ message_count + Cardinality({ n \in Peers : {msg.dst, n} \in mesh_links /\ n /= msg.src }) <= MaxMessages
    /\ peer_store' = [peer_store EXCEPT ![msg.dst] = @ \cup {msg.img}]
    /\ LET relay_msgs == { [src |-> msg.dst, dst |-> n, img |-> msg.img] : n \in {x \in Peers : {msg.dst, x} \in mesh_links /\ x /= msg.src} } IN
       /\ network_messages' = (network_messages \ {msg}) \cup relay_msgs
       /\ message_count' = message_count + Cardinality(relay_msgs)
    /\ UNCHANGED <<server_connected, mesh_links, peer_status>>

(* 5. A message is dropped because the receiver already has the image (Deduplication) *)
DropDuplicate(msg) ==
    /\ msg \in network_messages
    /\ msg.img \in peer_store[msg.dst]
    /\ network_messages' = network_messages \ {msg}
    /\ UNCHANGED <<server_connected, mesh_links, peer_store, peer_status, message_count>>

(* 6. A peer gracefully leaves the network *)
LeaveNetwork(p) ==
    /\ peer_status[p] \in {"Signaling", "Connected"}
    /\ server_connected' = server_connected \ {p}
    /\ mesh_links' = { link \in mesh_links : p \notin link }
    /\ peer_status' = [peer_status EXCEPT ![p] = "Offline"]
    /\ peer_store' = [peer_store EXCEPT ![p] = {}]
    /\ network_messages' = { m \in network_messages : m.src /= p /\ m.dst /= p }
    /\ UNCHANGED <<message_count>>

(***************************************************************************)
(* Next State Relation                                                     *)
(***************************************************************************)
Next ==
    \/ \E p \in Peers : JoinSignaling(p)
    \/ \E p1, p2 \in Peers : EstablishWebRTC(p1, p2)
    \/ \E p \in Peers, img \in Images : UploadAndBroadcast(p, img)
    \/ \E msg \in network_messages : ReceiveAndRelay(msg) \/ DropDuplicate(msg)
    \/ \E p \in Peers : LeaveNetwork(p)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

(***************************************************************************)
(* Safety Properties                                                       *)
(***************************************************************************)

(* The signaling server must never exceed MaxConnections *)
Safety_ServerLimit ==
    Cardinality(server_connected) <= MaxConnections

(***************************************************************************)
(* TLC Constraints                                                         *)
(***************************************************************************)
(* Hard stop for TLC to prevent state explosion if variables somehow exceed bounds *)
MaxMessagesLimit ==
    message_count <= MaxMessages

(***************************************************************************)
(* Liveness Properties                                                     *)
(***************************************************************************)

(* If an image is stored by a connected peer, it will eventually be stored by
   all peers that remain connected. TLC doesn't support [] on the left side of ~>,
   so we specify it as: A peer getting an image leads to all connected peers getting it.
   Note: Liveness under message loss or disconnects requires fairness constraints. *)
Liveness_EventualConsistency ==
    \A img \in Images :
        (\E p \in Peers : img \in peer_store[p])
        ~> (\A q \in Peers : peer_status[q] = "Connected" => img \in peer_store[q])

=============================================================================
