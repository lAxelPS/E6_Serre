function updateData(){

    document.getElementById("temperature").innerText = "24 °C"
    document.getElementById("humidity").innerText = "60 %"
    document.getElementById("light").innerText = "350 lux"
    document.getElementById("soil").innerText = "45 %"

}

setInterval(updateData,2000)