public/audio/ — dźwięki Moonpatch (zsyntetyzowane, własne – bez licencji zewnętrznych).
Każdy plik w dwóch formatach: .webm (Opus, podstawowy) i .mp3 (zapas dla starszego Safari).

Tła (pętle ~40 s, stereo, wyrównana głośność): gate, square, cafe, barn, haunt
Pojedyncze: gate-open, whoosh, door-cafe, door-barn, door-haunt, card-open, tag-open,
            basket-add, stamp, ticket-tear, moon, candle, monster
Interfejs:  hover

Pętle odtwarzać przez Web Audio (AudioBufferSourceNode, loop = true), nie przez <audio loop> –
MP3 ma dopełnienie kodera i w <audio> słychać przerwę na styku pętli.
