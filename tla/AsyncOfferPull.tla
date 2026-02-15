-------------------------- MODULE AsyncOfferPull --------------------------
EXTENDS Integers, Sequences, TLC, FiniteSets

CONSTANTS 
    Senders,    \* Set of Sender IDs
    Receiver,   \* Receiver ID
    Files       \* Set of File IDs to transfer

(*--algorithm AsyncOfferPull
variables
    network = {}; 
    
    \* Sender State
    pendingUploads = [s \in Senders |-> {}]; 
    transferQueue = [s \in Senders |-> <<>>]; 
    senderFiles = [s \in Senders |-> Files]; 
    
    \* Receiver State
    receivedFiles = {}; 
    
define
    Message(type, from, to, payload) == [type |-> type, from |-> from, to |-> to, payload |-> payload]
    
    TypeOK == 
        /\ network \in SUBSET [type: {"offer", "pull", "data"}, from: Senders \cup {Receiver}, to: Senders \cup {Receiver}, payload: Files \cup {"NULL"}]
        /\ \A s \in Senders: pendingUploads[s] \subseteq Files
    
    \* Termination Condition for Deadlock Check
    Done == 
        /\ \A s \in Senders: senderFiles[s] = {}
        /\ \A s \in Senders: pendingUploads[s] = {}
        /\ \A s \in Senders: transferQueue[s] = <<>>
        /\ network = {}
        /\ receivedFiles = Files
end define;

\* Sender Process: Single-threaded Event Loop
process Sender \in Senders
begin
EventLoop:
    while TRUE do
        either
            \* 1. Offer File (if any)
            with f \in senderFiles[self] do
                network := network \cup {Message("offer", self, Receiver, f)};
                pendingUploads[self] := pendingUploads[self] \cup {f};
                senderFiles[self] := senderFiles[self] \ {f};
            end with;
        or
            \* 2. Handle Pull Request (if any)
            with msg \in {m \in network: m.type = "pull" /\ m.to = self} do
                if msg.payload \in pendingUploads[self] then
                    network := (network \ {msg});
                    pendingUploads[self] := pendingUploads[self] \ {msg.payload};
                    transferQueue[self] := Append(transferQueue[self], msg.payload);
                else
                    network := network \ {msg};
                end if;
            end with;
        or
            \* 3. Transfer Worker (if queue not empty)
            await transferQueue[self] /= <<>>;
            with f = Head(transferQueue[self]) do
                network := network \cup {Message("data", self, Receiver, f)};
                transferQueue[self] := Tail(transferQueue[self]);
            end with;
        or
            \* 4. Termination Check (Allow stuttering only if done)
            await Done;
        end either;
    end while;
end process;

\* Receiver Process
process ReceiverProc = Receiver
begin
ReceiveLoop:
    while TRUE do
        either
            \* Handle Incoming Messages
            with msg \in {m \in network: m.to = Receiver} do
                if msg.type = "offer" then
                    network := (network \ {msg}) \cup {Message("pull", Receiver, msg.from, msg.payload)};
                elsif msg.type = "data" then
                    receivedFiles := receivedFiles \cup {msg.payload};
                    network := network \ {msg};
                else
                    network := network \ {msg};
                end if;
            end with;
        or
            \* Termination Check
            await Done;
        end either;
    end while;
end process;

end algorithm; *)
\* BEGIN TRANSLATION (chksum(pcal) = "4dc95288" /\ chksum(tla) = "42a68664")
VARIABLES network, pendingUploads, transferQueue, senderFiles, receivedFiles

(* define statement *)
Message(type, from, to, payload) == [type |-> type, from |-> from, to |-> to, payload |-> payload]

TypeOK ==
    /\ network \in SUBSET [type: {"offer", "pull", "data"}, from: Senders \cup {Receiver}, to: Senders \cup {Receiver}, payload: Files \cup {"NULL"}]
    /\ \A s \in Senders: pendingUploads[s] \subseteq Files


Done ==
    /\ \A s \in Senders: senderFiles[s] = {}
    /\ \A s \in Senders: pendingUploads[s] = {}
    /\ \A s \in Senders: transferQueue[s] = <<>>
    /\ network = {}
    /\ receivedFiles = Files


vars == << network, pendingUploads, transferQueue, senderFiles, receivedFiles
        >>

ProcSet == (Senders) \cup {Receiver}

Init == (* Global variables *)
        /\ network = {}
        /\ pendingUploads = [s \in Senders |-> {}]
        /\ transferQueue = [s \in Senders |-> <<>>]
        /\ senderFiles = [s \in Senders |-> Files]
        /\ receivedFiles = {}

Sender(self) == /\ \/ /\ \E f \in senderFiles[self]:
                           /\ network' = (network \cup {Message("offer", self, Receiver, f)})
                           /\ pendingUploads' = [pendingUploads EXCEPT ![self] = pendingUploads[self] \cup {f}]
                           /\ senderFiles' = [senderFiles EXCEPT ![self] = senderFiles[self] \ {f}]
                      /\ UNCHANGED transferQueue
                   \/ /\ \E msg \in {m \in network: m.type = "pull" /\ m.to = self}:
                           IF msg.payload \in pendingUploads[self]
                              THEN /\ network' = (network \ {msg})
                                   /\ pendingUploads' = [pendingUploads EXCEPT ![self] = pendingUploads[self] \ {msg.payload}]
                                   /\ transferQueue' = [transferQueue EXCEPT ![self] = Append(transferQueue[self], msg.payload)]
                              ELSE /\ network' = network \ {msg}
                                   /\ UNCHANGED << pendingUploads, 
                                                   transferQueue >>
                      /\ UNCHANGED senderFiles
                   \/ /\ transferQueue[self] /= <<>>
                      /\ LET f == Head(transferQueue[self]) IN
                           /\ network' = (network \cup {Message("data", self, Receiver, f)})
                           /\ transferQueue' = [transferQueue EXCEPT ![self] = Tail(transferQueue[self])]
                      /\ UNCHANGED <<pendingUploads, senderFiles>>
                   \/ /\ Done
                      /\ UNCHANGED <<network, pendingUploads, transferQueue, senderFiles>>
                /\ UNCHANGED receivedFiles

ReceiverProc == /\ \/ /\ \E msg \in {m \in network: m.to = Receiver}:
                           IF msg.type = "offer"
                              THEN /\ network' = ((network \ {msg}) \cup {Message("pull", Receiver, msg.from, msg.payload)})
                                   /\ UNCHANGED receivedFiles
                              ELSE /\ IF msg.type = "data"
                                         THEN /\ receivedFiles' = (receivedFiles \cup {msg.payload})
                                              /\ network' = network \ {msg}
                                         ELSE /\ network' = network \ {msg}
                                              /\ UNCHANGED receivedFiles
                   \/ /\ Done
                      /\ UNCHANGED <<network, receivedFiles>>
                /\ UNCHANGED << pendingUploads, transferQueue, senderFiles >>

Next == ReceiverProc
           \/ (\E self \in Senders: Sender(self))

Spec == Init /\ [][Next]_vars

\* END TRANSLATION 
=============================================================================
