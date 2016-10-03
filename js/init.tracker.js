/*
 * LoRaWAN GPS tracker - prototyp
 * ------------------------------
 * Prototyp aplikace k lokalizaci za pomocí sítě LoRaWAN
 * Poloha může být vypočtena trilaterací nebo několikanásobnou bilaterací, případně odhadnuta pomocí bilaterace nebo určena pomocí GPS
 *
 * Soutěžní projekt Czech IoT Summer Jam
 *
 * Autor: Jan Stejskal
 * http://jan-stejskal.cz
 * info@jan-stejskal.cz
 *
 */

const TOKEN = ""; // Summer Jam REST API token
const TX_POWER = -40;

var map;
/*
 * "devEUI":"0018B20000000165"
 * "devEUI":"0018B20000000336"
 * "devEUI":"0018B2000000016E"
 */
var dev_eui = "0018B20000000165"; // devEUI zařízení/lokátoru

$(function(){

	map = new google.maps.Map(document.getElementById("map"), {
		zoom: 8,
		center: {lat: 49.762197, lng: 15.395724}
	});

	get_data(dev_eui);
})
