-------------------------- MODULE LazyGossip --------------------------
EXTENDS Integers, Sequences, TLC, FiniteSets

CONSTANTS 
    Nodes,      \* Set of all nodes
    GossipTTL   \* Initial TTL for messages

(*--algorithm LazyGossip
variables
    \* Network State
    messages = {}; 
    
    \* Node State
    seen = [n \in Nodes |-> {}]; 
    
define
    \* Fixed Topology: Ring (n1 <-> n2 <-> n3 <-> n1)
    Connectivity == {
        <<"n1", "n2">>, <<"n2", "n3">>, <<"n3", "n1">>, 
        <<"n2", "n1">>, <<"n3", "n2">>, <<"n1", "n3">>
    }

    \* Message Constructor
    Msg(from, to, hash, ttl) == [from |-> from, to |-> to, hash |-> hash, ttl |-> ttl]
    
    \* Neighbors of a node
    Neighbors(n) == {m \in Nodes : <<n, m>> \in Connectivity \/ <<m, n>> \in Connectivity}
    
    \* Type Invariant
    TypeOK == 
        /\ messages \subseteq [from: Nodes \cup {"Genesis"}, to: Nodes, hash: STRING, ttl: Int]
        /\ \A n \in Nodes: seen[n] \subseteq STRING
        
    \* Desired Property: Eventual Consistency
    \* "Eventually all nodes see 'genesis_hash'"
    Consistency == 
        <>(\A n \in Nodes: "genesis_hash" \in seen[n])

    \* Termination Condition
    Done == 
        /\ messages = {}
        /\ \A n \in Nodes: "genesis_hash" \in seen[n]
end define;

\* Process: Nodes handling messages
process Node \in Nodes
begin
RunLoop:
    while ~Done do
        either
            \* Wait for message efficiently
            await {m \in messages : m.to = self} /= {};
            
            with msg \in {m \in messages : m.to = self} do
            if msg.hash \notin seen[self] then
                \* New Message: Mark as seen
                seen[self] := seen[self] \cup {msg.hash};
                
                \* Relay Logic
                if msg.ttl > 0 then
                    \* Send to all neighbors except sender
                    with targets = Neighbors(self) \ {msg.from} do
                        messages := (messages \ {msg}) \cup {Msg(self, t, msg.hash, msg.ttl - 1) : t \in targets};
                    end with;
                else
                    \* Expired: Just consume
                    messages := messages \ {msg};
                end if;
            else
                \* Already Seen: Just consume
                messages := messages \ {msg};
            end if;
            end with;
        or
            \* Allow termination
            await Done;
        end either;
    end while;
end process;

\* Process: Inject Initial Gossip
process Genesis = "Genesis"
begin
Seed:
    \* Inject a message to ONE Node (n1)
    \* Assuming n1 \in Nodes exists
    with n \in {x \in Nodes : TRUE} do
       messages := messages \cup {Msg("Genesis", n, "genesis_hash", GossipTTL)};
    end with;
end process;

end algorithm; *)
\* BEGIN TRANSLATION (chksum(pcal) = "fe82633d" /\ chksum(tla) = "6f4b5df3")
VARIABLES messages, seen, pc

(* define statement *)
Connectivity == {
    <<"n1", "n2">>, <<"n2", "n3">>, <<"n3", "n1">>,
    <<"n2", "n1">>, <<"n3", "n2">>, <<"n1", "n3">>
}


Msg(from, to, hash, ttl) == [from |-> from, to |-> to, hash |-> hash, ttl |-> ttl]


Neighbors(n) == {m \in Nodes : <<n, m>> \in Connectivity \/ <<m, n>> \in Connectivity}


TypeOK ==
    /\ messages \subseteq [from: Nodes \cup {"Genesis"}, to: Nodes, hash: STRING, ttl: Int]
    /\ \A n \in Nodes: seen[n] \subseteq STRING



Consistency ==
    <>(\A n \in Nodes: "genesis_hash" \in seen[n])


Done ==
    /\ messages = {}
    /\ \A n \in Nodes: "genesis_hash" \in seen[n]


vars == << messages, seen, pc >>

ProcSet == (Nodes) \cup {"Genesis"}

Init == (* Global variables *)
        /\ messages = {}
        /\ seen = [n \in Nodes |-> {}]
        /\ pc = [self \in ProcSet |-> CASE self \in Nodes -> "RunLoop"
                                        [] self = "Genesis" -> "Seed"]

RunLoop(self) == /\ pc[self] = "RunLoop"
                 /\ IF ~Done
                       THEN /\ \/ /\ {m \in messages : m.to = self} /= {}
                                  /\ \E msg \in {m \in messages : m.to = self}:
                                       IF msg.hash \notin seen[self]
                                          THEN /\ seen' = [seen EXCEPT ![self] = seen[self] \cup {msg.hash}]
                                               /\ IF msg.ttl > 0
                                                     THEN /\ LET targets == Neighbors(self) \ {msg.from} IN
                                                               messages' = ((messages \ {msg}) \cup {Msg(self, t, msg.hash, msg.ttl - 1) : t \in targets})
                                                     ELSE /\ messages' = messages \ {msg}
                                          ELSE /\ messages' = messages \ {msg}
                                               /\ seen' = seen
                               \/ /\ Done
                                  /\ UNCHANGED <<messages, seen>>
                            /\ pc' = [pc EXCEPT ![self] = "RunLoop"]
                       ELSE /\ pc' = [pc EXCEPT ![self] = "Done"]
                            /\ UNCHANGED << messages, seen >>

Node(self) == RunLoop(self)

Seed == /\ pc["Genesis"] = "Seed"
        /\ \E n \in {x \in Nodes : TRUE}:
             messages' = (messages \cup {Msg("Genesis", n, "genesis_hash", GossipTTL)})
        /\ pc' = [pc EXCEPT !["Genesis"] = "Done"]
        /\ seen' = seen

Genesis == Seed

(* Allow infinite stuttering to prevent deadlock on termination. *)
Terminating == /\ \A self \in ProcSet: pc[self] = "Done"
               /\ UNCHANGED vars

Next == Genesis
           \/ (\E self \in Nodes: Node(self))
           \/ Terminating

Spec == Init /\ [][Next]_vars
        /\ WF_vars(Next)

Termination == <>(\A self \in ProcSet: pc[self] = "Done")

\* END TRANSLATION 
=============================================================================
