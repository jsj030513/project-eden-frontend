function PrimaryButton({ children, onClick }) {
  return <button className="primary-button" type="button" onClick={onClick}>{children}</button>
}

export default PrimaryButton
