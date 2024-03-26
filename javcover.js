(function () {
  "use strict";

  let cropBtnId = "crop-btn";
  let cropping = false;
  let last_url = null;
  let _interval = null;

  function waitForElm(selector) {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver((mutations) => {
        if (document.querySelector(selector)) {
          resolve(document.querySelector(selector));
          observer.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  /**
   * Returns an array containing the scenario and scenario ID extracted from the current URL.
   * @returns {Array<string>} An array containing the scenario and scenario ID.
   */
  function getScenarioAndID() {
    var result = document.URL.match(/(movies)\/(\d+)/);
    var scenario = result[1];
    var scenario_id = result[2];
    return [scenario, scenario_id];
  }

  /**
   * Crops an image and returns a promise containing cropped image dataUrl.
   * @param {String} imgSrc
   * @param {Number} x
   * @param {Number} y
   * @param {Number} w
   * @param {Number} h
   * @returns {Promise}
   */
  function cropImage(imgSrc, x, y, w, h) {
    return new Promise((resolve, reject) => {
      // Create a new image object
      var img = new Image();

      // Set a callback function to execute when the image is loaded
      img.onload = function () {
        // Create a canvas element
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        // Get the 2D context of the canvas
        var ctx = canvas.getContext("2d");

        // Draw the image onto the canvas with the specified cropping coordinates
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

        // Convert the canvas back to an image
        var croppedData = canvas.toDataURL();

        // Resolve the promise with the cropped data
        resolve(croppedData);
      };

      // Set the source of the image
      img.src = imgSrc;

      // Handle image loading errors
      img.onerror = function () {
        reject();
      };
    });
  }

  /**
   * Updates GQL with movie covers.
   * @param {Number} movieId
   * @param {String} frontData
   * @param {String} backData
   * @returns {Promise}
   */
  async function updateMovie(movieId, frontData, backData) {
    const reqData = {
      operationName: "MovieUpdate",
      variables: {
        input: {
          id: movieId,
          front_image: frontData,
          back_image: backData,
        },
      },
      query: `mutation MovieUpdate($input: MovieUpdateInput!) {
            movieUpdate(input: $input) {
              id
              front_image_path
              back_image_path
            }
          }`,
    };
    return await stash.callGQL(reqData);
  }

  /**
   * Wait for image to load, then fire callback.
   * @param {HTMLImageElement} imgEl
   * @param {CallableFunction} callback
   */
  function waitForImg(imgEl, callback) {
    if (imgEl.complete || imgEl.onload) {
      callback.call(imgEl); // Invoke the callback with the image element as context
    } else {
      imgEl.onload = function () {
        callback.call(imgEl); // Invoke the callback with the image element as context
      };
    }
  }

  function init() {
    if (!_interval) {
      setTimeout(() => {
        _interval = setInterval(detect, 100);
      }, 2000);
    }
    waitForElm("#movie-page .detail-container").then(function () {
      const btnGrp = ".movie-head .details-edit";
      waitForElm(btnGrp).then(async ($el) => {
        if (!document.getElementById(cropBtnId)) {
          const [_, movieId] = getScenarioAndID();
          const imgContainer = getElementByXpath(
            "//div[contains(@class, 'movie-images')]"
          );
          const frontimg = getElementByXpath(
            "//div[contains(@class, 'movie-images')]//img[@alt='Front Cover']"
          );
          let backimg = getElementByXpath(
            "//div[contains(@class, 'movie-images')]//img[@alt='Back Cover']"
          );

          if (frontimg && !backimg) {
            waitForImg(frontimg, function () {
              let sourceimg = this;
              let frontBtn = sourceimg.parentNode,
                backBtn;
              const oWidth = sourceimg.naturalWidth;
              const oHeight = sourceimg.naturalHeight;

              if (oWidth == 800 && oHeight <= 600) {
                const cropBtn = document.createElement("button");
                cropBtn.setAttribute("id", cropBtnId);
                cropBtn.setAttribute("type", "button");
                cropBtn.setAttribute("class", "btn btn-warning");
                cropBtn.textContent = "Split Cover";
                $el.appendChild(cropBtn);

                cropBtn.addEventListener("click", (evt) => {
                  if (cropping) {
                    evt.preventDefault();
                    evt.stopPropagation();
                  }
                  cropping = true;
                  cropBtn.setAttribute("disabled", true);
                  cropImage(sourceimg.src, 420, 0, 380, oHeight)
                    .then((frontData) => {
                      cropImage(sourceimg.src, 0, 0, 380, oHeight)
                        .then((backData) => {
                          updateMovie(movieId, frontData, backData).then(
                            (resp) => {
                              if (resp?.data?.movieUpdate?.id) {
                                backBtn = frontBtn.cloneNode(true);
                                backimg = backBtn.querySelector("img");
                                backimg.setAttribute("alt", "BackCover");
                                backimg.src =
                                  resp.data.movieUpdate.back_image_path;
                                reloadImg(sourceimg.src);
                                imgContainer.appendChild(backBtn);
                                cropping = false;
                                cropBtn.style.display = "none";
                              } else if (resp?.errors[0]?.message) {
                                alert(resp.errors[0].message);
                                cropBtn.removeAttribute("disabled");
                                cropping = false;
                              }
                            }
                          );
                        })
                        .catch((error) => {
                          console.error(error);
                          cropBtn.removeAttribute("disabled");
                          cropping = false;
                        });
                    })
                    .catch((error) => {
                      console.error(error);
                      cropBtn.removeAttribute("disabled");
                      cropping = false;
                    });
                });
              }
            });
          }
        }
      });
    });
  }

  /**
   * Reset Crop Button
   */
  function resetButton() {
    if (document.getElementById(cropBtnId)) {
      const tmpBtn = document.getElementById(cropBtnId);
      if (tmpBtn.style.display == "none") {
        tmpBtn.style.display = "inline-block";
      }
    }
  }

  /**
   * Detect Local URL Change
   */
  function detect() {
    const newLoc = location.href !== last_url;
    const missingBtn = !document.getElementById(cropBtnId);
    const editHdr =
      "//div[contains(@class, 'detail-header') " +
      "and contains(@class, 'edit')]";
    const isEdit = !!getElementByXpath(editHdr);
    if (newLoc || (!newLoc && missingBtn && isEdit)) {
      if (location.href.match(/\/movies\/\d+\?/) != null) {
        last_url = location.href;
        resetButton();
        init();
      } else {
        last_url = null;
        if (_interval) {
          //clearInterval(_interval);
        }
      }
    }
  }

  stash.addEventListener("stash:page:movie:scenes", init);
})();
