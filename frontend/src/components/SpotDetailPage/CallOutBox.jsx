import { useRef } from "react";
import "./CallOutBox.css";
import { FaStar } from "react-icons/fa";
import { useSelector } from "react-redux";
export default function CalloutBox({ spot, reviews }) {
  const user = useSelector((state) => state.session.user);
  const isDisabled = useRef(true);
  console.log("this is the spot ===> ", spot);
  const setStatus = () => {
    user ? (isDisabled.current = false) : (isDisabled.current = true);
    return isDisabled;
  };

  return (
    <>
      <div className="booking-block" data-testid="spot-callout-box">
        <div className="price_reviews">
          <div data-testid="spot-price">$ {spot?.price?.toFixed(2)} night</div>
          {reviews.length ? (
            <div data-testid="spot-rating">
              <FaStar />
              {spot.avgRating} • {spot.numReviews === 1 ? <span>{spot.numReviews} review</span> : <span>{spot.numReviews} reviews</span>}
            </div>
          ) : (
            <div>
              <FaStar /> New
            </div>
          )}
        </div>
        <button data-testid="reserve-button" onClick={() => alert("Feature coming soon")} className={`booking-button ${isDisabled.current ? "" : "enabled"}`} disabled={setStatus().current}>
          Reserve
        </button>
      </div>
    </>
  );
}
