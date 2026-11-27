/**
 * The shop's animal friends: ten small characters, each drawn in a hand of its own as an illustrator would sign it.
 * A rabbit showing its muscles in brush and ink; a fox in a red cape holding up a sword, cut as a lino print; a kitten
 * in a hat and boots striding along, engraved in one red-brown ink; a kitten with a red ribbon in black and red crayon;
 * a pigeon in one blue crayon line; a bear in flat brown with nothing to say; a white bear in black marker; a cow as
 * round as a ball; a plump hen; and a kiwi in a rough black line. Each lives in friends/, one to a file with its own
 * pen, and is cut out with its paper behind it, so it reads over a dark profile picture as over a light one.
 *
 * The order is the shop's: icons.mjs numbers their files after the other icons in this order.
 */
import { piece as celek } from './friends/celek.mjs';
import { piece as hirc } from './friends/hirc.mjs';
import { piece as hircaSpi } from './friends/hirca-spi.mjs';
import { piece as kerosk } from './friends/kerosk.mjs';
import { piece as kevokaSin } from './friends/kevoka-sin.mjs';
import { piece as kiwi } from './friends/kiwi.mjs';
import { piece as mirisk } from './friends/mirisk.mjs';
import { piece as pisikCizme } from './friends/pisik-cizme.mjs';
import { piece as pisikQurdele } from './friends/pisik-qurdele.mjs';
import { piece as rovi } from './friends/rovi.mjs';

export const FRIENDS = [kerosk, rovi, pisikCizme, pisikQurdele, kevokaSin, hirc, hircaSpi, celek, mirisk, kiwi];
